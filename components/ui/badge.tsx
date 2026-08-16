import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from '@/lib/utils'

const badgeVariants = cva(
  'inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-xs font-medium whitespace-nowrap [&_svg]:size-3',
  {
    variants: {
      variant: {
        default: 'bg-secondary text-secondary-foreground',
        primary: 'bg-primary/10 text-primary',
        outline: 'border border-border text-muted-foreground',
        success: 'bg-success/12 text-success',
        warning: 'bg-warning/18 text-warning-foreground',
        danger: 'bg-destructive/12 text-destructive',
        info: 'bg-info/12 text-info',
      },
    },
    defaultVariants: { variant: 'default' },
  },
)

function Badge({
  className,
  variant,
  ...props
}: React.ComponentProps<'span'> & VariantProps<typeof badgeVariants>) {
  return <span className={cn(badgeVariants({ variant }), className)} {...props} />
}

export { Badge, badgeVariants }
