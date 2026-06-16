import createDOMPurify from 'dompurify'
import { marked } from 'marked'

const purifier = createDOMPurify(window)

const ALLOWED_TAGS = [
  'a',
  'b',
  'blockquote',
  'br',
  'code',
  'del',
  'div',
  'em',
  'h1',
  'h2',
  'h3',
  'h4',
  'h5',
  'h6',
  'hr',
  'i',
  'li',
  'ol',
  'p',
  'pre',
  'span',
  'strong',
  'table',
  'tbody',
  'td',
  'th',
  'thead',
  'tr',
  'ul'
]

const ALLOWED_ATTR = ['class', 'href', 'rel', 'style', 'target', 'title']
const ALLOWED_STYLE_PROPERTIES = new Set([
  'background',
  'background-color',
  'color',
  'font-style',
  'font-weight',
  'text-decoration'
])

purifier.addHook('uponSanitizeAttribute', (_node, data) => {
  if (data.attrName !== 'style') return

  const safeStyle = data.attrValue
    .split(';')
    .map((declaration) => declaration.trim())
    .filter(Boolean)
    .filter((declaration) => {
      const [property, ...valueParts] = declaration.split(':')
      if (!property || valueParts.length === 0) return false

      const normalizedProperty = property.trim().toLowerCase()
      const value = valueParts.join(':').trim().toLowerCase()
      if (!ALLOWED_STYLE_PROPERTIES.has(normalizedProperty)) return false
      if (
        value.includes('url(') ||
        value.includes('expression(') ||
        value.includes('javascript:')
      ) {
        return false
      }

      return true
    })
    .join('; ')

  if (safeStyle) {
    data.attrValue = safeStyle
  } else {
    data.keepAttr = false
  }
})

function normalizeSuggestionMarkup(text: string) {
  let normalized = text.replace(/<\/%(span)>/g, '</%span%>')

  normalized = normalized.replace(/<%(span)(?:\s+style="([^"]*)")?\s*%>/g, (_, _tag, style) =>
    style ? `<span style="${style}">` : '<span>'
  )
  normalized = normalized.replace(/<\/%span%>/g, '</span>')

  return normalized
}

export function renderSafeMarkdown(text: string) {
  const html = marked.parse(normalizeSuggestionMarkup(text), { async: false }) as string

  return purifier.sanitize(html, {
    ALLOWED_TAGS,
    ALLOWED_ATTR,
    ALLOWED_URI_REGEXP: /^(?:(?:https?|mailto):|[^a-z]|[a-z+.-]+(?:[^a-z+.-:]|$))/i,
    ADD_ATTR: ['target'],
    FORBID_TAGS: ['iframe', 'object', 'script', 'style']
  })
}
