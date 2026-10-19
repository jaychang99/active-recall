import { defaultSchema, type Options as SanitizeSchema } from 'rehype-sanitize';

/**
 * Raw HTML inside question text is allowed, then sanitized here (allowlist).
 * Scripts, iframes, objects, forms and every on* handler are dropped; style attributes are kept for
 * cosmetic markup; SVG is allowed inline; images may use http(s) or data:image URLs.
 */
const SVG_TAGS = ['svg', 'g', 'path', 'rect', 'circle', 'ellipse', 'line', 'polyline', 'polygon', 'text', 'tspan', 'defs', 'marker', 'linearGradient', 'radialGradient', 'stop', 'clipPath', 'mask', 'pattern', 'use', 'symbol', 'title', 'desc'];
const SVG_ATTRS = ['viewBox', 'xmlns', 'width', 'height', 'x', 'y', 'x1', 'y1', 'x2', 'y2', 'cx', 'cy', 'r', 'rx', 'ry', 'd', 'points', 'fill', 'stroke', 'strokeWidth', 'stroke-width', 'strokeLinecap', 'stroke-linecap', 'strokeLinejoin', 'stroke-linejoin', 'strokeDasharray', 'stroke-dasharray', 'opacity', 'fillOpacity', 'fill-opacity', 'transform', 'textAnchor', 'text-anchor', 'dominantBaseline', 'dominant-baseline', 'fontSize', 'font-size', 'fontFamily', 'font-family', 'fontWeight', 'font-weight', 'markerEnd', 'marker-end', 'markerStart', 'marker-start', 'markerWidth', 'markerHeight', 'refX', 'refY', 'orient', 'offset', 'stopColor', 'stop-color', 'gradientUnits', 'preserveAspectRatio', 'role', 'ariaLabel', 'aria-label', 'clipPath', 'clip-path', 'dx', 'dy', 'id', 'className'];
const EXTRA_TAGS = ['mark', 'kbd', 'abbr', 'sub', 'sup', 'u', 's', 'ins', 'del', 'small', 'span', 'div', 'details', 'summary', 'figure', 'figcaption', 'dl', 'dt', 'dd', 'ruby', 'rt', 'rp', 'audio', 'video', 'source', 'caption', 'colgroup', 'col', 'hr', 'br', 'cite', 'q', 'var', 'samp', 'time', 'data', 'wbr', 'bdi', 'bdo', 'picture'];

const attributes: NonNullable<SanitizeSchema['attributes']> = { ...defaultSchema.attributes };
const allowEverywhere = ['style', 'title', 'lang', 'dir', 'role', 'ariaLabel', 'aria-label', 'ariaHidden', 'aria-hidden', 'className', 'id'];
attributes['*'] = [...(attributes['*'] ?? []), ...allowEverywhere];
for (const t of SVG_TAGS) attributes[t] = [...(attributes[t] ?? []), ...SVG_ATTRS];
attributes.img = [...(attributes.img ?? []), 'src', 'alt', 'width', 'height', 'loading'];
attributes.a = [...(attributes.a ?? []), 'href', 'target', 'rel'];
attributes.td = [...(attributes.td ?? []), 'colSpan', 'colspan', 'rowSpan', 'rowspan', 'align'];
attributes.th = [...(attributes.th ?? []), 'colSpan', 'colspan', 'rowSpan', 'rowspan', 'align', 'scope'];
attributes.details = [...(attributes.details ?? []), 'open'];
attributes.audio = ['controls', 'src', 'preload', 'loop'];
attributes.video = ['controls', 'src', 'preload', 'loop', 'muted', 'playsInline', 'poster', 'width', 'height'];
attributes.source = ['src', 'type'];
attributes.col = ['span'];
attributes.time = ['dateTime'];
// KaTeX / remark-math markers must survive sanitizing (rehype-katex runs afterwards)
attributes.div = [...(attributes.div ?? []), ['className', 'math', 'math-display']];
attributes.span = [...(attributes.span ?? []), ['className', 'math', 'math-inline']];

export const sanitizeSchema: SanitizeSchema = {
  ...defaultSchema,
  tagNames: [...new Set([...(defaultSchema.tagNames ?? []), ...EXTRA_TAGS, ...SVG_TAGS])],
  attributes,
  protocols: { ...defaultSchema.protocols, src: ['http', 'https', 'data'], href: ['http', 'https', 'mailto', 'tel'] },
  clobberPrefix: 'q-',
  strip: ['script', 'style', 'iframe', 'object', 'embed', 'form', 'input', 'button', 'textarea', 'select', 'link', 'meta', 'base', 'frame', 'frameset', 'applet', 'math'],
};
