import {
  agentMessage,
  peerMessage,
  peerCitation,
  type AgentMessage,
} from "../../../pi/src/runtime/entries.ts";
import { messageData } from "../../../pi/src/runtime/input.ts";

export type Attribution = {
  kind: "owner" | "guest" | "session" | "external" | "subagent";
  name: string;
  text: string;
  intent?: AgentMessage["intent"];
  quote?: { name: string; text: string };
};

export function structuredAttribution(
  kind: string,
  data: unknown,
): Attribution | undefined {
  const agent = agentMessage(kind, data);
  if (agent)
    return {
      kind: "subagent",
      name: agent.from.name,
      text: agent.text,
      intent: agent.intent,
    };
  const peer = peerMessage(kind, data);
  if (peer)
    return {
      kind: peer.from.kind ?? "session",
      name: peer.from.title.trim() || "Conversation",
      text: peer.text,
      quote: peerCitation(peer)?.quote,
    };
  const person = messageData(data);
  if (person)
    return {
      kind: person.author.kind,
      name: person.author.name,
      text: person.text,
    };
}
