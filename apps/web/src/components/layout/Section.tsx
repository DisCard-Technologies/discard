interface SectionProps {
    children: React.ReactNode
    className?: string
    fullWidth?: boolean
    noPadding?: boolean
  }
  
  export default function Section({ 
    children, 
    className = '', 
    fullWidth = false,
    noPadding = false 
  }: SectionProps) {
    const baseClasses = "self-stretch flex flex-col"
    const paddingClasses = noPadding ? "" : fullWidth ? "py-72" : "px-[50px] py-72"
    
    return (
      <section className={`${baseClasses} ${paddingClasses} ${className}`}>
        {children}
      </section>
    )
  }