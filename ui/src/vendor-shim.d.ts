// Ambient module shims for third-party packages when their official typings are unavailable.
declare module '@radix-ui/react-accordion' {
  const primitive: { [key: string]: any };
  export = primitive;
}

declare module '@radix-ui/react-alert-dialog' {
  const primitive: { [key: string]: any };
  export = primitive;
}

declare module '@radix-ui/react-aspect-ratio' {
  const primitive: { [key: string]: any };
  export = primitive;
}

declare module '@radix-ui/react-avatar' {
  const primitive: { [key: string]: any };
  export = primitive;
}

declare module '@radix-ui/react-checkbox' {
  const primitive: { [key: string]: any };
  export = primitive;
}

declare module '@radix-ui/react-collapsible' {
  const primitive: { [key: string]: any };
  export = primitive;
}

declare module '@radix-ui/react-context-menu' {
  const primitive: { [key: string]: any };
  export = primitive;
}

declare module '@radix-ui/react-dialog' {
  const primitive: { [key: string]: any };
  export = primitive;
}

declare module '@radix-ui/react-dropdown-menu' {
  const primitive: { [key: string]: any };
  export = primitive;
}

declare module '@radix-ui/react-hover-card' {
  const primitive: { [key: string]: any };
  export = primitive;
}

declare module '@radix-ui/react-label' {
  const primitive: { [key: string]: any };
  export = primitive;
}

declare module '@radix-ui/react-menubar' {
  const primitive: { [key: string]: any };
  export = primitive;
}

declare module '@radix-ui/react-navigation-menu' {
  const primitive: { [key: string]: any };
  export = primitive;
}

declare module '@radix-ui/react-popover' {
  const primitive: { [key: string]: any };
  export = primitive;
}

declare module '@radix-ui/react-progress' {
  const primitive: { [key: string]: any };
  export = primitive;
}

declare module '@radix-ui/react-radio-group' {
  const primitive: { [key: string]: any };
  export = primitive;
}

declare module '@radix-ui/react-scroll-area' {
  const primitive: { [key: string]: any };
  export = primitive;
}

declare module '@radix-ui/react-select' {
  const primitive: { [key: string]: any };
  export = primitive;
}

declare module '@radix-ui/react-separator' {
  const primitive: { [key: string]: any };
  export = primitive;
}

declare module '@radix-ui/react-slider' {
  const primitive: { [key: string]: any };
  export = primitive;
}

declare module '@radix-ui/react-slot' {
  export const Slot: any;
  export default Slot;
}

declare module '@radix-ui/react-switch' {
  const primitive: { [key: string]: any };
  export = primitive;
}

declare module '@radix-ui/react-tabs' {
  const primitive: { [key: string]: any };
  export = primitive;
}

declare module '@radix-ui/react-toggle' {
  const primitive: { [key: string]: any };
  export = primitive;
}

declare module '@radix-ui/react-toggle-group' {
  const primitive: { [key: string]: any };
  export = primitive;
}

declare module '@radix-ui/react-tooltip' {
  const primitive: { [key: string]: any };
  export = primitive;
}

declare module 'class-variance-authority' {
  export function cva(...args: any[]): any;
  export type VariantProps<T> = any;
}

declare module 'clsx' {
  export default function clsx(...values: any[]): string;
  export type ClassValue = any;
}

declare module 'cmdk' {
  export const Command: any;
}

declare module 'embla-carousel-react' {
  const useEmblaCarousel: any;
  export default useEmblaCarousel;
  export type EmblaCarouselType = any;
  export type EmblaOptionsType = any;
  export type EmblaPluginType = any;
}

declare module 'input-otp' {
  export const OTPInput: any;
  export const OTPInputContext: any;
}

declare module 'lucide-react' {
  export const Activity: any;
  export const ArrowDown: any;
  export const ArrowLeft: any;
  export const ArrowRight: any;
  export const ArrowUp: any;
  export const CheckIcon: any;
  export const ChevronDownIcon: any;
  export const ChevronLeft: any;
  export const ChevronLeftIcon: any;
  export const ChevronRight: any;
  export const ChevronRightIcon: any;
  export const ChevronUpIcon: any;
  export const CircleIcon: any;
  export const GripVerticalIcon: any;
  export const Minus: any;
  export const MinusIcon: any;
  export const MoreHorizontal: any;
  export const MoreHorizontalIcon: any;
  export const PanelLeftIcon: any;
  export const PauseCircle: any;
  export const PlayCircle: any;
  export const SearchIcon: any;
  export const TrendingDown: any;
  export const TrendingUp: any;
  export const XIcon: any;
  const icons: { [key: string]: any };
  export default icons;
}

declare module 'next-themes' {
  export function useTheme(): { theme?: string; setTheme?: (theme: string) => void };
}

declare module 'react-day-picker' {
  export const DayPicker: any;
}

declare module 'react-hook-form' {
  export type FieldValues = any;
  export type FieldPath<T extends FieldValues = FieldValues> = any;
  export type ControllerProps<TFieldValues extends FieldValues = FieldValues> = any;
  export const Controller: any;
  export const FormProvider: any;
  export function useFormContext<TFieldValues extends FieldValues = FieldValues>(): any;
  export function useFormState(props: any): any;
}

declare module 'react-resizable-panels' {
  const primitive: { [key: string]: any };
  export = primitive;
}

declare module 'recharts' {
  export const CartesianGrid: any;
  export const Line: any;
  export const LineChart: any;
  export const ReferenceLine: any;
  export const ResponsiveContainer: any;
  export const Tooltip: any;
  export type TooltipProps = any;
  export const XAxis: any;
  export const YAxis: any;
  const Recharts: { [key: string]: any };
  export default Recharts;
}

declare module 'sonner' {
  export const Toaster: any;
  export type ToasterProps = any;
  export function toast(message: string, options?: any): void;
}

declare module 'tailwind-merge' {
  export function twMerge(...values: any[]): string;
}

declare module 'vaul' {
  export const Drawer: any;
}
