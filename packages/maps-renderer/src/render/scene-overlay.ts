import { RENDER_SAMPLE_COUNT } from "./constants.js";

const shader = `
@group(0) @binding(0) var<uniform> projectionView: mat4x4f;
@group(0) @binding(1) var atlas: texture_2d<f32>;
@group(0) @binding(2) var atlasSampler: sampler;

struct VertexOutput {
  @builtin(position) clip: vec4f,
  @location(0) uv: vec2f,
  @location(1) color: vec3f,
};

@vertex fn vertex(@location(0) xyz: vec3f, @location(1) uv: vec2f,
                  @location(2) color: vec3f) -> VertexOutput {
  return VertexOutput(projectionView * vec4f(xyz, 1), uv, color);
}

@fragment fn fragment(input: VertexOutput) -> @location(0) vec4f {
  let texel = textureSample(atlas, atlasSampler, input.uv);
  let color = select(texel, vec4f(1), input.uv.x < 0);
  if (color.a < 0.45) { discard; }
  return vec4f(color.rgb * input.color, 1);
}
`;

export async function createSceneOverlay(
  device: GPUDevice,
  format: GPUTextureFormat,
  image: ImageBitmap,
) {
  const module = device.createShaderModule({ code: shader });
  const pipeline = await device.createRenderPipelineAsync({
    label: "Maps scene overlay",
    layout: "auto",
    vertex: {
      module,
      entryPoint: "vertex",
      buffers: [
        {
          arrayStride: 32,
          attributes: [
            { shaderLocation: 0, offset: 0, format: "float32x3" },
            { shaderLocation: 1, offset: 12, format: "float32x2" },
            { shaderLocation: 2, offset: 20, format: "float32x3" },
          ],
        },
      ],
    },
    fragment: { module, entryPoint: "fragment", targets: [{ format }] },
    depthStencil: { format: "depth24plus", depthWriteEnabled: true, depthCompare: "less-equal" },
    multisample: { count: RENDER_SAMPLE_COUNT },
  });
  const atlas = device.createTexture({
    size: [image.width, image.height],
    format: "rgba8unorm",
    usage:
      GPUTextureUsage.TEXTURE_BINDING |
      GPUTextureUsage.COPY_DST |
      GPUTextureUsage.RENDER_ATTACHMENT,
  });
  const matrix = device.createBuffer({
    size: 64,
    usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
  });
  let vertices: GPUBuffer | undefined;
  const dispose = () => {
    vertices?.destroy();
    matrix.destroy();
    atlas.destroy();
  };
  try {
    device.queue.copyExternalImageToTexture({ source: image }, { texture: atlas }, [
      image.width,
      image.height,
    ]);
    const group = device.createBindGroup({
      layout: pipeline.getBindGroupLayout(0),
      entries: [
        { binding: 0, resource: { buffer: matrix } },
        { binding: 1, resource: atlas.createView() },
        { binding: 2, resource: device.createSampler() },
      ],
    });
    return {
      prepare(projectionView: Float32Array<ArrayBuffer>, triangles: Float32Array<ArrayBuffer>) {
        if (!vertices || vertices.size < triangles.byteLength) {
          const next = device.createBuffer({
            size: Math.max(4096, 2 ** Math.ceil(Math.log2(triangles.byteLength))),
            usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
          });
          vertices?.destroy();
          vertices = next;
        }
        device.queue.writeBuffer(matrix, 0, projectionView);
        device.queue.writeBuffer(vertices, 0, triangles);
        const buffer = vertices;
        return (pass: GPURenderPassEncoder) => {
          pass.setPipeline(pipeline);
          pass.setBindGroup(0, group);
          pass.setVertexBuffer(0, buffer);
          pass.draw(triangles.length / 8);
        };
      },
      dispose,
    };
  } catch (error) {
    dispose();
    throw error;
  }
}
