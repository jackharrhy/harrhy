import json
from pathlib import Path
root=Path('/tmp/xeet-api-review')
keys=json.loads((root/'source/assets/vendor/icons.json').read_text())
# Original simple geometry for this integration, not copies of X's sprite.
generic='<path d="M4 4H20V20H4ZM7 7V17H17V7Z" fill-rule="evenodd"/>'
shapes={
 'icon-reply':'<path d="M3 4H21V17H10L5 21V17H3ZM5 6V15H7V17L10 15H19V6Z" fill-rule="evenodd"/>',
 'icon-repost':'<path d="M4 5H18V2L23 6L18 10V7H6V13H4ZM20 19H6V22L1 18L6 14V17H18V11H20Z"/>',
 'icon-heart':'<path d="M12 21L3 12C-3 4 7-2 12 6C17-2 27 4 21 12Z"/>',
 'icon-bookmark':'<path d="M5 2H19V22L12 17L5 22ZM7 4V18L12 15L17 18V4Z" fill-rule="evenodd"/>',
 'icon-share-ios':'<path d="M11 15V5L7 9L5 7L12 0L19 7L17 9L13 5V15ZM3 12H5V20H19V12H21V22H3Z"/>',
 'icon-bar-chart':'<path d="M3 13H7V21H3ZM10 8H14V21H10ZM17 3H21V21H17Z"/>',
 'icon-more-dots-hor':'<circle cx="5" cy="12" r="2"/><circle cx="12" cy="12" r="2"/><circle cx="19" cy="12" r="2"/>',
 'icon-player-play':'<path d="M6 3L22 12L6 21Z"/>',
 'icon-chevron-down-md':'<path d="M3 7L12 16L21 7L23 9L12 20L1 9Z"/>',
 'icon-arrow-left':'<path d="M11 2L1 12L11 22L13 20L6 13H23V11H6L13 4Z"/>',
 'icon-verified-premium-color':'<circle cx="12" cy="12" r="10" fill="#2765a0"/><path d="M5 12L10 17L19 8L17 6L10 13L7 10Z" fill="#ffffff"/>',
}
for k in ('icon-verified-business-color','icon-verified-government-color'):
 shapes[k]=shapes['icon-verified-premium-color']
(root/'safe-vendor/icons.json').write_text(json.dumps({k:{'viewBox':'0 0 24 24','body':shapes.get(k,generic)} for k in keys},indent=2)+'\n')
