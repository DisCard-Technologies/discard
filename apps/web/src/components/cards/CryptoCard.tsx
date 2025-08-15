import Image from "next/image"

interface CryptoCardProps {
  label: string
  name: string
  price: string
  icon?: string
}

export default function CryptoCard({ label, name, price, icon = "Group 84.svg" }: CryptoCardProps) {
  return (
    <div className="card-crypto group hover:scale-105 transition-transform duration-300 cursor-pointer">
      <span className="self-stretch relative leading-[140%] text-gray-400 text-14">
        {label}
      </span>
      <Image 
        className="w-32 relative h-32 group-hover:scale-110 transition-transform duration-300" 
        width={32} 
        height={32} 
        sizes="100vw" 
        alt={`${name} icon`} 
        src={icon} 
      />
      <div className="self-stretch flex flex-col items-start justify-start gap-4">
        <h3 className="self-stretch relative tracking-[-0.02em] leading-[120%] font-medium">
          {name}
        </h3>
        <div className="flex flex-row items-center justify-start gap-2 text-14">
          <span className="relative leading-[140%]">{price}</span>
          <span className="relative leading-[140%] text-gray-400">USD</span>
        </div>
      </div>
    </div>
  )
}