// Format bytes for disk space (capacity)
export const formatBytes = (bytes: number): string => {
  // Input validation and error handling
  if (typeof bytes !== 'number' || isNaN(bytes)) {
    return '0 B';
  }
  
  if (bytes === 0) return '0 B';
  if (bytes < 0) return '0 B';
  
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB', 'PB'];
  
  try {
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    
    // Prevent array index out of bounds
    const sizeIndex = Math.min(i, sizes.length - 1);
    const formattedValue = bytes / Math.pow(k, sizeIndex);
    
    // Handle very large numbers
    if (!isFinite(formattedValue)) {
      return '0 B';
    }
    
    return parseFloat(formattedValue.toFixed(1)) + ' ' + sizes[sizeIndex];
  } catch (error) {
    // Fallback in case of any calculation errors
    console.warn('[formatBytes] Calculation error:', error, 'bytes:', bytes);
    return '0 B';
  }
};

// Format bytes per second for network/disk speeds
export const formatSpeed = (bytesPerSecond: number): string => {
  // Input validation and error handling
  if (typeof bytesPerSecond !== 'number' || isNaN(bytesPerSecond)) {
    return '0 B/s';
  }
  
  if (bytesPerSecond === 0) return '0 B/s';
  if (bytesPerSecond < 0) return '0 B/s';
  
  const k = 1024;
  const sizes = ['B/s', 'KB/s', 'MB/s', 'GB/s', 'TB/s'];
  
  try {
    const i = Math.floor(Math.log(bytesPerSecond) / Math.log(k));
    
    // Prevent array index out of bounds
    const sizeIndex = Math.min(i, sizes.length - 1);
    const formattedValue = bytesPerSecond / Math.pow(k, sizeIndex);
    
    // Handle very large numbers
    if (!isFinite(formattedValue)) {
      return '0 B/s';
    }
    
    return parseFloat(formattedValue.toFixed(1)) + ' ' + sizes[sizeIndex];
  } catch (error) {
    // Fallback in case of any calculation errors
    console.warn('[formatSpeed] Calculation error:', error, 'bytesPerSecond:', bytesPerSecond);
    return '0 B/s';
  }
}; 