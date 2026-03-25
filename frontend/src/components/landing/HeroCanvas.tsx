'use client'
import { useEffect, useRef } from 'react'

const COLORS = [
  '#cba6f7','#89b4fa','#94e2d5',
  '#a6e3a1','#f38ba8','#74c7ec','#b4befe',
]

interface ChartLine {
  id: number
  color: string
  lineWidth: number
  volatility: number
  maxAlpha: number
  alpha: number
  isFocusSpawn: boolean
  ox: number; oy: number
  right: Array<{x:number;y:number}>
  left:  Array<{x:number;y:number}>
  velR: number; velL: number
  stepPx: number
  phase: 'growing'|'holding'|'fading'
  holdFrames: number; holdTimer: number
  fadeFrames: number; fadeTimer: number
  done: boolean
}

let idCounter = 0
let focusedId: number | null = null
let focusAlpha = 0

export default function HeroCanvas() {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')!
    let W = 0, H = 0
    const lines: ChartLine[] = []
    let ambientSlot = 0
    let spawnTimer = 0
    let rafId: number

    function resize() {
      if (!canvas) return // The Next.js 15 safety check
      W = canvas.width  = canvas.offsetWidth
      H = canvas.height = canvas.offsetHeight
    }
    resize()
    const ro = new ResizeObserver(resize)
    ro.observe(canvas)

    function nextY(y: number, vel: number, vol: number) {
      const noise  = (Math.random() - 0.5) * vol
      let newVel   = vel * 0.74 + noise
      if (Math.random() < 0.04) newVel += (Math.random() - 0.5) * vol * 4
      const newY   = Math.max(H * 0.03, Math.min(H * 0.97, y + newVel))
      return { y: newY, vel: newVel }
    }

    function createLine(ox: number, oy: number, isFocus = false): ChartLine {
      return {
        id: idCounter++,
        color: COLORS[Math.floor(Math.random() * COLORS.length)],
        lineWidth: isFocus ? 1.2 + Math.random() * 0.6 : 0.5 + Math.random() * 0.7,
        volatility: 10 + Math.random() * 22,
        maxAlpha: isFocus ? 0.55 + Math.random() * 0.2 : 0.13 + Math.random() * 0.1,
        alpha: 0, isFocusSpawn: isFocus,
        ox, oy,
        right: [{x:ox,y:oy}], left: [{x:ox,y:oy}],
        velR: (Math.random()-0.5)*6, velL: (Math.random()-0.5)*6,
        stepPx: 3 + Math.random() * 4,
        phase: 'growing',
        holdFrames: isFocus ? 80+Math.random()*80 : 60+Math.random()*100,
        holdTimer: 0, fadeFrames: 50+Math.random()*40, fadeTimer: 0,
        done: false,
      }
    }

    function spawnAmbient() {
      if (lines.filter(l=>!l.isFocusSpawn).length >= 3) return
      const bands = 5, band = ambientSlot++ % bands
      const bandH = H / bands
      lines.push(createLine(W*(0.3+Math.random()*0.4), bandH*band+bandH*(0.15+Math.random()*0.7)))
    }

    function onInteract(e: MouseEvent | TouchEvent) {
      if (!canvas) return
      const rect = canvas.getBoundingClientRect()
      const src  = 'touches' in e ? e.touches[0] : e
      const x    = src.clientX - rect.left
      const y    = src.clientY - rect.top
      for (let i = lines.length-1; i>=0; i--) if (lines[i].isFocusSpawn) lines.splice(i,1)
      const line = createLine(x, y, true)
      lines.push(line)
      focusedId = line.id
    }
    canvas.addEventListener('click', onInteract)
    canvas.addEventListener('touchstart', onInteract, {passive:true})

    // Seed
    setTimeout(() => spawnAmbient(), 300)
    setTimeout(() => spawnAmbient(), 1100)

    function loop() {
      ctx.clearRect(0,0,W,H)
      const vg = ctx.createRadialGradient(W/2,H/2,H*0.05,W/2,H/2,W*0.7)
      vg.addColorStop(0,'transparent')
      vg.addColorStop(1,'rgba(17,17,27,0.65)')
      ctx.fillStyle = vg; ctx.fillRect(0,0,W,H)

      const hasFocus = focusedId!==null && lines.some(l=>l.id===focusedId && !l.done)
      focusAlpha += ((hasFocus?1:0) - focusAlpha) * 0.06
      if (!hasFocus && focusAlpha<0.01) { focusedId=null; focusAlpha=0 }

      for (let i=lines.length-1; i>=0; i--) {
        const l = lines[i]
        // update
        if (l.phase==='growing') {
          const rL=l.right[l.right.length-1]
          if (rL.x<W+20) { const r=nextY(rL.y,l.velR,l.volatility); l.velR=r.vel; l.right.push({x:rL.x+l.stepPx,y:r.y}) }
          const lL=l.left[l.left.length-1]
          if (lL.x>-20) { const r=nextY(lL.y,l.velL,l.volatility); l.velL=r.vel; l.left.push({x:lL.x-l.stepPx,y:r.y}) }
          l.alpha=Math.min(l.alpha+0.014,l.maxAlpha)
          if (rL.x>=W+20&&lL.x<=-20) l.phase='holding'
        } else if (l.phase==='holding') {
          l.holdTimer++; if (l.holdTimer>=l.holdFrames) l.phase='fading'
        } else {
          l.fadeTimer++; l.alpha=l.maxAlpha*(1-l.fadeTimer/l.fadeFrames)
          if (l.fadeTimer>=l.fadeFrames) l.done=true
        }
        // draw
        if (l.alpha>0) {
          const pts=[...[...l.left].reverse(),...l.right.slice(1)]
          if (pts.length>=2) {
            const isFocused=l.id===focusedId
            const dim=(focusedId!==null&&!isFocused)?focusAlpha:0
            ctx.save()
            ctx.globalAlpha=Math.max(0,l.alpha*(1-dim*0.94))
            ctx.strokeStyle=l.color; ctx.lineWidth=l.lineWidth
            ctx.lineJoin='round'; ctx.lineCap='round'
            ctx.beginPath()
            pts.forEach((p,j)=>j===0?ctx.moveTo(p.x,p.y):ctx.lineTo(p.x,p.y))
            ctx.stroke(); ctx.restore()
          }
        }
        if (l.done) lines.splice(i,1)
      }

      spawnTimer++
      if (spawnTimer>=200) { spawnTimer=0; spawnAmbient() }
      rafId=requestAnimationFrame(loop)
    }
    loop()

    return () => {
      cancelAnimationFrame(rafId)
      ro.disconnect()
      canvas.removeEventListener('click', onInteract)
    }
  }, [])

  return <canvas ref={canvasRef} className="absolute inset-0 w-full h-full" />
}
