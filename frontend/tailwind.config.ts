import type { Config } from 'tailwindcss'

const config: Config = {
  darkMode: ['class'],
  content: [
    './src/pages/**/*.{js,ts,jsx,tsx,mdx}',
    './src/components/**/*.{js,ts,jsx,tsx,mdx}',
    './src/app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      fontFamily: {
        sans:  ['var(--font-syne)', 'sans-serif'],
        mono:  ['var(--font-jetbrains)', 'monospace'],
        syne:  ['var(--font-syne)', 'sans-serif'],
      },
      colors: {
        // Catppuccin Mocha
        crust:    '#11111b',
        mantle:   '#181825',
        base:     '#1e1e2e',
        surface0: '#313244',
        surface1: '#45475a',
        surface2: '#585b70',
        overlay0: '#6c7086',
        overlay1: '#7f849c',
        overlay2: '#9399b2',
        subtext0: '#a6adc8',
        subtext1: '#bac2de',
        text:     '#cdd6f4',
        lavender: '#b4befe',
        blue:     '#89b4fa',
        sapphire: '#74c7ec',
        sky:      '#89dceb',
        teal:     '#94e2d5',
        green:    '#a6e3a1',
        yellow:   '#f9e2af',
        peach:    '#fab387',
        maroon:   '#eba0ac',
        red:      '#f38ba8',
        mauve:    '#cba6f7',
        pink:     '#f5c2e7',
        flamingo: '#f2cdcd',
        rosewater:'#f5e0dc',
      },
      borderRadius: {
        lg: 'var(--radius)',
        md: 'calc(var(--radius) - 2px)',
        sm: 'calc(var(--radius) - 4px)',
      },
      keyframes: {
        'fade-in': {
          '0%':   { opacity: '0', transform: 'translateY(16px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        'fade-in-fast': {
          '0%':   { opacity: '0' },
          '100%': { opacity: '1' },
        },
        'spin-slow': {
          to: { transform: 'rotate(360deg)' },
        },
        'chevron-bounce': {
          '0%,100%': { transform: 'rotate(45deg) translateY(0)', opacity: '0.4' },
          '50%':     { transform: 'rotate(45deg) translateY(4px)', opacity: '1' },
        },
        'glow-pulse': {
          '0%,100%': { boxShadow: '0 0 8px rgba(203,166,247,0.2)' },
          '50%':     { boxShadow: '0 0 20px rgba(203,166,247,0.5)' },
        },
      },
      animation: {
        'fade-in':       'fade-in 0.5s ease forwards',
        'fade-in-fast':  'fade-in-fast 0.3s ease forwards',
        'spin-slow':     'spin-slow 1s linear infinite',
        'chevron-bounce':'chevron-bounce 1.4s ease-in-out infinite',
        'glow-pulse':    'glow-pulse 2s ease-in-out infinite',
      },
    },
  },
  plugins: [],
}

export default config
