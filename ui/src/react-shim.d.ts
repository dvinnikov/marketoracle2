// Minimal React type declarations to satisfy the TypeScript compiler in environments
// where the official @types/react package cannot be installed.
declare module 'react' {
  export = React;
  export as namespace React;

  namespace React {
    type Key = string | number;
    type ReactText = string | number;
    type ReactChild = ReactElement | ReactText;
    type ReactNode = ReactChild | ReactNode[] | boolean | null | undefined;

    interface ReactElement<P = any, T = any> {
      type: T;
      props: P;
      key: Key | null;
    }

    interface CSSProperties {
      [key: string]: string | number | undefined;
    }

    interface Attributes {
      key?: Key;
    }

    type Ref<T> =
      | ((instance: T | null) => void)
      | MutableRefObject<T | null>
      | null;

    interface MutableRefObject<T> {
      current: T;
    }

    interface ForwardRefRenderFunction<T, P = {}> {
      (props: P, ref: Ref<T>): ReactElement | null;
    }

    type DependencyList = readonly any[];

    type Dispatch<A> = (value: A) => void;
    type SetStateAction<S> = S | ((prevState: S) => S);

    interface Context<T> {
      Provider: any;
      Consumer: any;
      displayName?: string;
    }

    function createElement<P>(
      type: any,
      props?: P | null,
      ...children: ReactNode[]
    ): ReactElement<P>;
    function cloneElement<P>(element: ReactElement<P>, props?: Partial<P>, ...children: ReactNode[]): ReactElement<P>;
    const Fragment: unique symbol;

    function createContext<T>(defaultValue: T): Context<T>;
    function useContext<T>(context: Context<T> | any): T;
    function useState<S>(initialState: S | (() => S)): [S, Dispatch<SetStateAction<S>>];
    function useReducer<R extends (state: any, action: any) => any, I>(
      reducer: R,
      initialArg: I,
      init?: (arg: I) => ReturnType<R>
    ): [ReturnType<R>, Dispatch<Parameters<R>[1]>];
    function useEffect(effect: (...args: any[]) => void | (() => void), deps?: DependencyList): void;
    function useLayoutEffect(effect: (...args: any[]) => void | (() => void), deps?: DependencyList): void;
    function useMemo<T>(factory: () => T, deps: DependencyList): T;
    function useCallback<T extends (...args: any[]) => any>(callback: T, deps: DependencyList): T;
    function useRef<T>(initialValue: T | null): MutableRefObject<T | null>;
    function useImperativeHandle<T, R extends T>(ref: Ref<T>, init: () => R, deps?: DependencyList): void;
    function useId(): string;

    type PropsWithChildren<P = {}> = P & { children?: ReactNode };
    type ComponentType<P = {}> = (props: P) => ReactElement | null;
    interface FunctionComponent<P = {}> {
      (props: PropsWithChildren<P>): ReactElement | null;
      displayName?: string;
      defaultProps?: Partial<P>;
    }
    type FC<P = {}> = FunctionComponent<P>;

    function forwardRef<T, P = {}>(render: ForwardRefRenderFunction<T, P>): ComponentType<PropsWithChildren<P> & { ref?: Ref<T> }>;
    function memo<T extends ComponentType<any>>(component: T, propsAreEqual?: (prevProps: any, nextProps: any) => boolean): T;

    type ComponentProps<T> = T extends ComponentType<infer P> ? P : any;
    type ComponentPropsWithRef<T> = ComponentProps<T> & { ref?: Ref<any> };
    type ComponentPropsWithoutRef<T> = ComponentProps<T>;
    type ElementRef<T> = any;
    type ElementType<P = any> = ComponentType<P> | string;
    type JSXElementConstructor<P> = any;

    interface DOMAttributes<T> {
      children?: ReactNode;
      dangerouslySetInnerHTML?: { __html: string };
      [key: string]: any;
    }

    interface HTMLAttributes<T> extends DOMAttributes<T> {
      className?: string;
      style?: CSSProperties;
      [key: string]: any;
    }

    interface SVGAttributes<T> extends DOMAttributes<T> {
      [key: string]: any;
    }

    type DetailedHTMLProps<E, T> = any;
    interface HTMLProps<T> extends HTMLAttributes<T> {}
    interface AnchorHTMLAttributes<T> extends HTMLAttributes<T> {
      href?: string;
      target?: string;
    }
    interface ButtonHTMLAttributes<T> extends HTMLAttributes<T> {
      disabled?: boolean;
      type?: string;
    }
    interface InputHTMLAttributes<T> extends HTMLAttributes<T> {
      value?: any;
      defaultValue?: any;
      type?: string;
      onChange?: (...args: any[]) => void;
    }
    interface TextareaHTMLAttributes<T> extends HTMLAttributes<T> {
      value?: any;
      defaultValue?: any;
      onChange?: (...args: any[]) => void;
    }
    interface ImgHTMLAttributes<T> extends HTMLAttributes<T> {
      src?: string;
      alt?: string;
    }
    interface LabelHTMLAttributes<T> extends HTMLAttributes<T> {
      htmlFor?: string;
    }
    interface SelectHTMLAttributes<T> extends HTMLAttributes<T> {
      value?: any;
      defaultValue?: any;
      onChange?: (...args: any[]) => void;
    }
    interface HTMLProps<T> extends HTMLAttributes<T> {}

    type RefAttributes<T> = { ref?: Ref<T> };
    type PropsWithoutRef<P> = P;
    type PropsWithRef<P> = P & { ref?: Ref<any> };
  }
}

declare namespace JSX {
  interface Element extends React.ReactElement {}
  interface ElementClass {
    render: any;
  }
  interface ElementAttributesProperty {
    props: any;
  }
  interface IntrinsicAttributes {
    key?: React.Key;
  }
  interface IntrinsicElements {
    [elemName: string]: any;
  }
}

declare module 'react-dom/client' {
  import React = require('react');

  interface Root {
    render(children: React.ReactNode): void;
    unmount(): void;
  }

  export function createRoot(container: Element | DocumentFragment): Root;
}

declare module 'react/jsx-runtime' {
  export const Fragment: unique symbol;
  export function jsx(type: any, props: any, key?: any): any;
  export function jsxs(type: any, props: any, key?: any): any;
  export function jsxDEV(type: any, props: any, key?: any, isStaticChildren?: boolean, source?: any, self?: any): any;
}
