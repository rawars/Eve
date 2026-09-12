export type Rectangle = { x: number; y: number; width: number; height: number }
export type Point = { x: number; y: number }
export type VariableType = 'color' | 'number' | 'string' | 'boolean'
export type VariableValue = string | number | boolean | { aliasTo: string }
export type CanvasVariable = {
  id: string
  name: string
  type: VariableType
  values: Record<string, VariableValue>
}
export type VariableCollection = {
  id: string
  name: string
  global?: boolean
  modes: { id: string; name: string }[]
  variables: CanvasVariable[]
}
export type ShadowEffect = {
  id: string
  type: 'drop-shadow' | 'inner-shadow'
  visible: boolean
  x: number
  y: number
  blur: number
  spread: number
  color: string
  opacity: number
}
export type RectangleElement = Rectangle & {
  id: string
  name: string
  type: 'rectangle'
  fill: string
  visible: boolean
  locked?: boolean
  radius?: number
  rotation?: number
  opacity?: number
  effects?: ShadowEffect[]
  parentId?: string
  component?: boolean
  instanceOf?: string
  componentSourceId?: string
  variantSetId?: string
  variantProperties?: Record<string, string>
  overrides?: string[]
  variableBindings?: Record<string, string>
  fillWidth?: boolean
  fillHeight?: boolean
}
export type CircleElement = Rectangle & {
  id: string
  name: string
  type: 'circle'
  fill: string
  visible: boolean
  locked?: boolean
  rotation?: number
  opacity?: number
  effects?: ShadowEffect[]
  parentId?: string
  component?: boolean
  instanceOf?: string
  componentSourceId?: string
  variantSetId?: string
  variantProperties?: Record<string, string>
  overrides?: string[]
  variableBindings?: Record<string, string>
  fillWidth?: boolean
  fillHeight?: boolean
}
export type FrameElement = Rectangle & {
  id: string
  name: string
  type: 'frame'
  fill: string
  visible: boolean
  locked?: boolean
  radius?: number
  rotation?: number
  opacity?: number
  effects?: ShadowEffect[]
  clipContent: boolean
  layoutMode: 'none' | 'horizontal' | 'vertical' | 'grid'
  gap: number
  padding: number
  alignX: 'start' | 'center' | 'end'
  alignY: 'start' | 'center' | 'end'
  fixedWidth?: boolean
  fixedHeight?: boolean
  minWidth?: number
  maxWidth?: number
  minHeight?: number
  maxHeight?: number
  autoGap?: boolean
  parentId?: string
  component?: boolean
  instanceOf?: string
  componentSourceId?: string
  componentSet?: boolean
  variantSetId?: string
  variantProperties?: Record<string, string>
  overrides?: string[]
  variableBindings?: Record<string, string>
  variableModes?: Record<string, string>
  fillWidth?: boolean
  fillHeight?: boolean
}
export type TextElement = Rectangle & {
  id: string
  name: string
  type: 'text'
  text: string
  fontSize: number
  fontFamily: string
  fontWeight: number
  lineHeight: number
  letterSpacing: number
  textAlign: 'left' | 'center' | 'right'
  verticalAlign: 'top' | 'middle' | 'bottom'
  autoWidth?: boolean
  autoHeight?: boolean
  fill: string
  visible: boolean
  locked?: boolean
  parentId?: string
  component?: boolean
  instanceOf?: string
  componentSourceId?: string
  variantSetId?: string
  variantProperties?: Record<string, string>
  overrides?: string[]
  variableBindings?: Record<string, string>
  componentPropertyName?: string
  fillWidth?: boolean
  fillHeight?: boolean
}
export type ImageElement = Rectangle & {
  id: string
  name: string
  type: 'image'
  src: string
  assetId?: string
  visible: boolean
  locked?: boolean
  opacity?: number
  parentId?: string
  component?: boolean
  instanceOf?: string
  componentSourceId?: string
  variantSetId?: string
  variantProperties?: Record<string, string>
  overrides?: string[]
  variableBindings?: Record<string, string>
  fillWidth?: boolean
  fillHeight?: boolean
}
export type CanvasElement = RectangleElement | CircleElement | FrameElement | TextElement | ImageElement
export type CanvasLayer = {
  id: string
  name: string
  expanded: boolean
  visible: boolean
  locked?: boolean
  elements: CanvasElement[]
}
export type CanvasPage = {
  id: string
  name: string
  layers: CanvasLayer[]
}
export type CanvasDocument = {
  layers: CanvasLayer[]
  pages?: CanvasPage[]
  activePageId?: string
  activeElementId: string | null
  selectedElementIds: string[]
  background?: string
  variableCollections?: VariableCollection[]
  variableModes?: Record<string, string>
}
export type ResizeHandle =
  | 'north-west' | 'north' | 'north-east' | 'east'
  | 'south-east' | 'south' | 'south-west' | 'west'
