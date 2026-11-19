import Button, { type ButtonProps } from '@cloudscape-design/components/button'
import Link, { type LinkProps } from '@cloudscape-design/components/link'
import { useNavigate } from 'react-router-dom'

/** Cloudscape Link that navigates inside the app without a page reload. */
export function AppLink({ href, ...props }: LinkProps & { href: string }) {
  const navigate = useNavigate()
  return <Link {...props} href={href} onFollow={(e) => { e.preventDefault(); navigate(href) }} />
}

/** Cloudscape Button that navigates inside the app without a page reload. */
export function AppButtonLink({ href, ...props }: ButtonProps & { href: string }) {
  const navigate = useNavigate()
  return <Button {...props} href={href} onFollow={(e) => { e.preventDefault(); navigate(href) }} />
}
