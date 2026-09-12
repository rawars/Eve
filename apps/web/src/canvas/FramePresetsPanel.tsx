import { IconDeviceDesktop, IconDeviceMobile, IconDeviceTablet, IconDeviceWatch, IconDevices, IconShare3 } from '@tabler/icons-react'
import { useState } from 'react'
import { Button } from 'react-aria-components'

export type FramePreset = { name: string; width: number; height: number; kind?: 'phone' | 'tablet' | 'watch' | 'display' | 'share' }
type Group = { name: string; presets: FramePreset[] }
type Library = { name: string; color: string; groups: Group[] }
const p = (name: string, width: number, height: number, kind: FramePreset['kind'] = 'phone'): FramePreset => ({ name, width, height, kind })

const libraries: Library[] = [
  { name: 'Apple Devices', color: 'bg-amber-400', groups: [
    { name: 'Apple TV', presets: [p('Apple TV', 1920, 1080, 'display'), p('Apple TV 4K', 3840, 2160, 'display')] },
    { name: 'Apple Watch', presets: [p('SE 1, 2, 3 40mm', 162, 197, 'watch'), p('SE 1, 2, 3 44mm', 184, 224, 'watch'), p('Series 8 41mm', 176, 215, 'watch'), p('Series 8 45mm', 198, 242, 'watch'), p('Series 9 41mm', 176, 215, 'watch'), p('Series 9 45mm', 198, 242, 'watch'), p('Series 10 42mm', 187, 223, 'watch'), p('Series 10 46mm', 208, 248, 'watch'), p('Series 11 42mm', 187, 223, 'watch'), p('Series 11 46mm', 208, 248, 'watch'), p('Ultra 1 49mm', 205, 251, 'watch'), p('Ultra 2 49mm', 205, 251, 'watch'), p('Ultra 3 49mm', 211, 257, 'watch')] },
    { name: 'Displays', presets: [p('Pro Display XDR', 3008, 1692, 'display'), p('Studio Display', 2560, 1440, 'display')] },
    { name: 'iPad', presets: [p('iPad 10.2”', 810, 1080, 'tablet'), p('iPad Air (3rd Gen) 10.5”', 834, 1112, 'tablet'), p('iPad Air (5th Gen) 10.9”', 820, 1180, 'tablet'), p('iPad Air (6th Gen) 11”', 820, 1180, 'tablet'), p('iPad Air (6th Gen) 13”', 1024, 1366, 'tablet'), p('iPad mini 7.9”', 768, 1024, 'tablet'), p('iPad mini 8.3', 744, 1133, 'tablet'), p('iPad Pro (4th Gen) 11”', 834, 1194, 'tablet'), p('iPad Pro (6th Gen) 12.9”', 1024, 1366, 'tablet'), p('iPad Pro (7th Gen) 11”', 834, 1210, 'tablet'), p('iPad Pro (7th Gen) 13”', 1032, 1376, 'tablet')] },
    { name: 'iPhone', presets: [p('iPhone 13', 390, 844), p('iPhone 13 mini', 375, 812), p('iPhone 13 Pro', 390, 844), p('iPhone 13 Pro Max', 428, 926), p('iPhone 14', 390, 844), p('iPhone 14 Plus', 428, 926), p('iPhone 14 Pro', 393, 852), p('iPhone 14 Pro Max', 430, 932), p('iPhone 15', 393, 852), p('iPhone 15 Plus', 430, 932), p('iPhone 15 Pro', 393, 852), p('iPhone 15 Pro Max', 430, 932), p('iPhone 16', 393, 852), p('iPhone 16 Plus', 430, 932), p('iPhone 16 Pro', 402, 874), p('iPhone 16 Pro Max', 440, 956), p('iPhone 16e', 390, 844), p('iPhone 17', 402, 874), p('iPhone 17 Air', 420, 912), p('iPhone 17 Pro', 402, 874), p('iPhone 17 Pro Max', 440, 956), p('iPhone 17e', 390, 844), p('iPhone SE 4-inch', 320, 568), p('iPhone SE 4.7-inch', 375, 667)] },
    { name: 'Mac', presets: [p('iMac 21.5”', 1920, 1080, 'display'), p('iMac 24”', 2240, 1260, 'display'), p('iMac 27”', 2560, 1440, 'display'), p('MacBook Air 13”', 1440, 900, 'display'), p('MacBook Air 13” M2', 1470, 956, 'display'), p('MacBook Neo', 1440, 900, 'display'), p('MacBook Pro 13”', 1440, 900, 'display'), p('MacBook Pro 14”', 1512, 982, 'display'), p('MacBook Pro 16”', 1728, 1117, 'display'), p('MacBook Pro 16” 2019', 1536, 960, 'display')] },
  ] },
  { name: 'Android Devices', color: 'bg-emerald-400', groups: [
    { name: 'Google Pixel', presets: [p('Google Pixel 7', 360, 800), p('Google Pixel 7 Pro', 480, 1040), p('Google Pixel 7a', 360, 800), p('Google Pixel 8', 360, 800), p('Google Pixel 8 Pro', 448, 997), p('Google Pixel 8a', 360, 800), p('Google Pixel 9', 360, 808), p('Google Pixel 9 Pro', 427, 952), p('Google Pixel 9 Pro Fold', 692, 717, 'tablet'), p('Google Pixel 9 Pro XL', 445, 997), p('Google Pixel Fold', 613, 736, 'tablet'), p('Google Pixel Tablet', 1280, 800, 'tablet')] },
    { name: 'Miscellaneous', presets: [p('Generic Android Device', 360, 800)] },
    { name: 'OnePlus', presets: [p('OnePlus 11', 480, 1072), p('OnePlus 12', 480, 1056), p('OnePlus Ace 2', 413, 924), p('OnePlus Ace 2 Pro', 413, 924), p('OnePlus Ace 3 Pro', 421, 927), p('OnePlus Nord 3', 413, 924), p('OnePlus Nord 4', 413, 924), p('OnePlus Open', 756, 813, 'tablet')] },
    { name: 'Samsung Galaxy', presets: [p('Galaxy S22', 360, 780), p('Galaxy S22 Ultra', 480, 1029), p('Galaxy S22+', 360, 780), p('Galaxy S23', 360, 780), p('Galaxy S23 Ultra', 480, 1029), p('Galaxy S23+', 360, 780), p('Galaxy S24', 360, 780), p('Galaxy S24 Ultra', 480, 1040), p('Galaxy S24+', 480, 1040), p('Galaxy Z Flip 4', 360, 880), p('Galaxy Z Flip 5', 360, 880), p('Galaxy Z Flip 6', 360, 880), p('Galaxy Z Fold 4', 604, 725, 'tablet'), p('Galaxy Z Fold 5', 604, 725, 'tablet'), p('Galaxy Z Fold 6', 619, 720, 'tablet')] },
  ] },
  { name: 'Web', color: 'bg-teal-400', groups: [
    { name: 'Desktop', presets: [p('1 · Extra Small', 1024, 1080, 'display'), p('2 · Small', 1280, 1080, 'display'), p('3 · Medium', 1440, 1080, 'display'), p('4 · Large', 1920, 1080, 'display'), p('5 · Extra Large', 2560, 1440, 'display')] },
    { name: 'Mobile', presets: [p('1 · Extra Small', 320, 640), p('2 · Small', 360, 800), p('3 · Medium', 390, 844), p('4 · Large', 393, 873)] },
    { name: 'Share', presets: [p('OpenGraph', 1200, 630, 'share'), p('X (Twitter) (Square)', 600, 600, 'share'), p('X (Twitter) (Wide)', 1200, 600, 'share')] },
    { name: 'Tablet', presets: [p('1 · Small', 768, 1024, 'tablet'), p('2 · Medium', 820, 1024, 'tablet'), p('3 · Large', 1024, 1024, 'tablet')] },
  ] },
]

function DevicePreview({ preset, color }: { preset: FramePreset; color: string }) {
  const Icon = preset.kind === 'share' ? IconShare3 : preset.kind === 'display' ? IconDeviceDesktop
    : preset.kind === 'tablet' ? IconDeviceTablet : preset.kind === 'watch' ? IconDeviceWatch : IconDeviceMobile
  return <span className={`grid size-10 shrink-0 place-items-center rounded-md ${color}`}>
    <Icon size={24} stroke={1.8} className="text-neutral-800" />
  </span>
}

export function FramePresetsPanel({ onSelect }: { onSelect: (preset: FramePreset) => void }) {
  const [libraryName, setLibraryName] = useState(libraries[0].name)
  const library = libraries.find((item) => item.name === libraryName) ?? libraries[0]
  return <aside aria-label="Frame presets" className="absolute right-4 top-4 z-10 flex max-h-[calc(100dvh-2rem)] w-72 flex-col overflow-hidden rounded-xl border border-neutral-200 bg-white shadow-[0_8px_24px_rgba(0,0,0,0.10)]">
    <header className="shrink-0 border-b border-neutral-100 p-3.5">
      <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-neutral-900"><IconDevices size={17} />Frame Templates</div>
      <select aria-label="Frame template library" value={libraryName} onChange={(event) => setLibraryName(event.target.value)}
        className="h-8 w-full rounded-lg border-0 bg-neutral-100 px-2.5 text-xs font-semibold text-neutral-700 outline-none focus:ring-2 focus:ring-blue-400">
        {libraries.map((item) => <option key={item.name}>{item.name}</option>)}
      </select>
    </header>
    <div className="overflow-y-auto px-2 pb-2">
      {library.groups.map((group) => <section key={group.name} aria-label={group.name}>
        <h3 className="px-1.5 pb-1 pt-3 text-[11px] font-semibold text-neutral-400">{group.name}</h3>
        {group.presets.map((preset) => <Button key={`${group.name}-${preset.name}`} onPress={() => onSelect(preset)}
          className="flex w-full items-center gap-2.5 rounded-lg p-1.5 text-left outline-none hover:bg-neutral-100 focus-visible:bg-blue-50 focus-visible:ring-2 focus-visible:ring-blue-400">
          <DevicePreview preset={preset} color={library.color} />
          <span className="min-w-0 flex-1"><span className="block truncate text-xs font-semibold text-neutral-800">{preset.name}</span>
            <span className="block text-[10px] tabular-nums text-neutral-400">{preset.width} × {preset.height}</span></span>
        </Button>)}
      </section>)}
    </div>
  </aside>
}
