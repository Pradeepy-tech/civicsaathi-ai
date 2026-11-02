import React, { useState } from 'react';
import { ImageOff } from 'lucide-react';

interface CivicImageProps {
  src: string;
  alt: string;
  className?: string;
  fallbackLabel?: string;
}

export const CivicImage: React.FC<CivicImageProps> = ({
  src,
  alt,
  className = 'w-full h-full object-cover',
  fallbackLabel,
}) => {
  const [hasError, setHasError] = useState(false);

  if (!src || hasError) {
    return (
      <div
        className={`flex flex-col items-center justify-center bg-[#F1F5F9] border border-[#162E51]/12 text-[#162E51]/70 p-6 text-center ${className}`}
        role="img"
        aria-label={alt}
      >
        <ImageOff className="w-6 h-6 text-[#005EA2] mb-2 shrink-0" aria-hidden="true" />
        <span className="text-xs text-[#162E51]/80 max-w-xs">
          {fallbackLabel || alt}
        </span>
      </div>
    );
  }

  return (
    <img
      src={src}
      alt={alt}
      referrerPolicy="no-referrer"
      onError={() => setHasError(true)}
      className={className}
    />
  );
};

export async function compressImageFile(file: File): Promise<string> {
  if (!file.type.startsWith('image/')) {
    throw new Error('Please select a valid JPEG, PNG, or WebP image file.');
  }
  if (file.size > 10 * 1024 * 1024) {
    throw new Error('Selected photo exceeds 10 MB. Please choose a smaller image.');
  }

  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Could not read selected image file.'));
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error('Could not decode selected image.'));
      img.onload = () => {
        const maxDim = 1024;
        let { width, height } = img;
        if (width > maxDim || height > maxDim) {
          if (width >= height) {
            height = Math.round((height * maxDim) / width);
            width = maxDim;
          } else {
            width = Math.round((width * maxDim) / height);
            height = maxDim;
          }
        }

        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          reject(new Error('Browser canvas unavailable for image compression.'));
          return;
        }
        ctx.drawImage(img, 0, 0, width, height);
        const compressedDataUri = canvas.toDataURL('image/jpeg', 0.78);
        resolve(compressedDataUri);
      };
      img.src = String(reader.result);
    };
    reader.readAsDataURL(file);
  });
}
