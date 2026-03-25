'use client'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { motion } from 'framer-motion'
import { useStore } from '@/store/execution'
import { REGIME_NAMES, type RegimeId } from '@/types'
import { cn } from '@/lib/utils'

const NAV_LINKS = [
  { href: '/configure',  label: 'Configure' },
  { href: '/overview',   label: 'Strategy' },
  { href: '/schedule',   label: 'Schedule' },
  { href: '/risk',       label: 'Risk' },
  { href: '/regime',     label: 'Regime Monitor', divider: true },
  { href: '/monitor',    label: 'Live Monitor' },
  { href: '/report',     label: 'Report' },
]

const REGIME_CLASSES: Record<RegimeId, string> = {
  0: 'regime-0', 1: 'regime-1', 2: 'regime-2', 3: 'regime-3',
}

export default function TopNav() {
  const pathname     = usePathname()
  const currentRegime = useStore(s => s.currentRegime)

  return (
    <motion.nav
      initial={{ opacity: 0, y: -8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      className="h-[52px] flex-shrink-0 bg-mantle border-b border-surface0
                 flex items-center px-6 gap-0 z-50 justify-between"
    >
      {/* Logo */}
      <Link
        href="/"
        className="font-syne font-extrabold text-base text-mauve tracking-[4px]
                   mr-7 flex-shrink-0 hover:text-lavender transition-colors"
      >
        ARXIS
      </Link>

      {/* Nav links */}
      <div className="flex items-center gap-0.5 flex-1">
        {NAV_LINKS.map((link, i) => (
          <div key={link.href} className="flex items-center">
            {link.divider && (
              <div className="w-px h-5 bg-surface0 mx-1.5" />
            )}
            <Link
              href={link.href}
              className={cn(
                'px-3 py-1.5 rounded-lg text-[11px] font-medium font-mono',
                'transition-all duration-150 border',
                pathname === link.href
                  ? 'bg-surface0 text-mauve border-surface1'
                  : 'text-overlay1 border-transparent hover:bg-surface0 hover:text-text',
              )}
            >
              {link.label}
            </Link>
          </div>
        ))}
      </div>

      {/* Regime badge */}
      <div className={cn('regime-badge ml-4 flex-shrink-0', REGIME_CLASSES[currentRegime])}>
        <span className="w-1.5 h-1.5 rounded-full bg-current" />
        R{currentRegime} — {REGIME_NAMES[currentRegime].split(' — ')[0]}
      </div>
    </motion.nav>
  )
}
