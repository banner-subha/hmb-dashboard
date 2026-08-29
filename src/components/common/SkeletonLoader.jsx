export default function SkeletonLoader({ variant = 'card', count = 1, className = '' }) {
  const Skeletons = Array.from({ length: count }).map((_, i) => {
    switch (variant) {
      case 'kpi':
        return (
          <div key={i} className={`skeleton p-5 rounded-xl h-28 ${className}`}>
            <div className="h-3 w-1/3 bg-bg-secondary/50 rounded mb-4"></div>
            <div className="h-8 w-1/2 bg-bg-secondary/50 rounded mb-2"></div>
            <div className="h-2 w-1/4 bg-bg-secondary/50 rounded"></div>
          </div>
        );
      case 'chart':
        return (
          <div key={i} className={`skeleton rounded-xl h-64 p-5 flex flex-col justify-end gap-2 ${className}`}>
             <div className="flex gap-2 h-full items-end justify-between px-4">
               {[40, 70, 45, 90, 65, 30, 80].map((h, j) => (
                 <div key={j} className="w-8 bg-bg-secondary/50 rounded-t-sm" style={{ height: `${h}%` }}></div>
               ))}
             </div>
          </div>
        );
      case 'table-row':
        return (
          <div key={i} className={`skeleton flex items-center justify-between p-4 border-b border-border/30 h-16 ${className}`}>
            <div className="flex items-center gap-4 w-1/3">
              <div className="w-12 h-6 bg-bg-secondary/50 rounded"></div>
              <div className="h-4 flex-1 bg-bg-secondary/50 rounded"></div>
            </div>
            <div className="h-4 w-16 bg-bg-secondary/50 rounded"></div>
            <div className="h-4 w-12 bg-bg-secondary/50 rounded"></div>
            <div className="h-4 w-16 bg-bg-secondary/50 rounded"></div>
          </div>
        );
      case 'card':
      default:
        return (
          <div key={i} className={`skeleton p-4 rounded-xl ${className}`}>
            <div className="h-4 w-1/3 bg-bg-secondary/50 rounded mb-4"></div>
            <div className="space-y-2">
              <div className="h-3 w-full bg-bg-secondary/50 rounded"></div>
              <div className="h-3 w-5/6 bg-bg-secondary/50 rounded"></div>
              <div className="h-3 w-4/6 bg-bg-secondary/50 rounded"></div>
            </div>
          </div>
        );
    }
  });

  return <>{Skeletons}</>;
}
