import Image from "next/image"

interface ButtonProps {
  children: React.ReactNode
  onClick?: () => void
  variant?: 'primary' | 'secondary'
  showArrow?: boolean
  className?: string
}

export default function Button({ 
  children, 
  onClick, 
  variant = 'primary', 
  showArrow = false,
  className = ''
}: ButtonProps) {
  const baseClasses = "flex flex-row items-center justify-center font-semibold transition-all duration-300"
  
  const variantClasses = {
    primary: "btn-primary hover:shadow-lg hover:shadow-lightgreen-100/20",
    secondary: "rounded-12 bg-gray-700 hover:bg-gray-600 px-24 py-[13px] text-white"
  }

  return (
    <button 
      onClick={onClick}
      className={`${baseClasses} ${variantClasses[variant]} ${className}`}
    >
      <span className="relative leading-[140%]">{children}</span>
      {showArrow && (
        <Image
          className="w-20 relative max-h-full ml-8"
          width={20}
          height={20}
          sizes="100vw"
          alt="arrow"
          src="Right arrow.svg"
        />
      )}
    </button>
  )
}