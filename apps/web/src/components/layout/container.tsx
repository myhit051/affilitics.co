import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"

const containerVariants = cva(
  "mx-auto w-full",
  {
    variants: {
      size: {
        sm: "max-w-2xl",
        default: "max-w-6xl",
        lg: "max-w-7xl",
        xl: "max-w-screen-2xl",
        full: "max-w-none",
      },
      padding: {
        none: "",
        sm: "px-4 sm:px-6",
        default: "px-4 sm:px-6 lg:px-8",
        lg: "px-6 sm:px-8 lg:px-12",
      },
    },
    defaultVariants: {
      size: "default",
      padding: "default",
    },
  }
)

export interface ContainerProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof containerVariants> {}

const Container = React.forwardRef<HTMLDivElement, ContainerProps>(
  ({ className, size, padding, ...props }, ref) => {
    return (
      <div
        ref={ref}
        className={cn(containerVariants({ size, padding, className }))}
        {...props}
      />
    )
  }
)
Container.displayName = "Container"

// Specialized containers for different use cases
interface GridContainerProps extends ContainerProps {
  cols?: number
  gap?: "sm" | "default" | "lg"
}

const GridContainer = React.forwardRef<HTMLDivElement, GridContainerProps>(
  ({ className, cols = 1, gap = "default", children, ...props }, ref) => {
    const gapClasses = {
      sm: "gap-4",
      default: "gap-6",
      lg: "gap-8",
    }

    return (
      <Container
        ref={ref}
        className={cn(
          "grid",
          `grid-cols-1 md:grid-cols-${Math.min(cols, 4)}`,
          gapClasses[gap],
          className
        )}
        {...props}
      >
        {children}
      </Container>
    )
  }
)
GridContainer.displayName = "GridContainer"

interface FlexContainerProps extends ContainerProps {
  direction?: "row" | "column"
  align?: "start" | "center" | "end" | "stretch"
  justify?: "start" | "center" | "end" | "between" | "around" | "evenly"
  gap?: "sm" | "default" | "lg"
  wrap?: boolean
}

const FlexContainer = React.forwardRef<HTMLDivElement, FlexContainerProps>(
  ({ 
    className, 
    direction = "row", 
    align = "start", 
    justify = "start", 
    gap = "default",
    wrap = false,
    ...props 
  }, ref) => {
    const directionClasses = {
      row: "flex-row",
      column: "flex-col",
    }

    const alignClasses = {
      start: "items-start",
      center: "items-center",
      end: "items-end",
      stretch: "items-stretch",
    }

    const justifyClasses = {
      start: "justify-start",
      center: "justify-center",
      end: "justify-end",
      between: "justify-between",
      around: "justify-around",
      evenly: "justify-evenly",
    }

    const gapClasses = {
      sm: "gap-4",
      default: "gap-6",
      lg: "gap-8",
    }

    return (
      <Container
        ref={ref}
        className={cn(
          "flex",
          directionClasses[direction],
          alignClasses[align],
          justifyClasses[justify],
          gapClasses[gap],
          wrap && "flex-wrap",
          className
        )}
        {...props}
      />
    )
  }
)
FlexContainer.displayName = "FlexContainer"

export { Container, GridContainer, FlexContainer, containerVariants }