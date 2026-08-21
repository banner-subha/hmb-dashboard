import {
  flexRender,
  getCoreRowModel,
  getSortedRowModel,
  getPaginationRowModel,
  useReactTable,
} from '@tanstack/react-table';
import { useState, memo } from 'react';
import { ArrowDown, ArrowUp, ArrowUpDown } from 'lucide-react';
import { useMediaQuery } from '../../hooks/useMediaQuery';

const TableRow = memo(function TableRow({ row, onRowClick }) {
  return (
    <tr 
      onClick={() => onRowClick && onRowClick(row.original)}
      className={`table-row-separator transition-colors bg-bg-card hover:bg-bg-card-hover group ${onRowClick ? 'cursor-pointer' : ''}`}
    >
      {row.getVisibleCells().map((cell, index) => (
        <td 
          key={cell.id} 
          className={`px-2.5 sm:px-3 py-3.5 table-cell-separator ${index === 0 ? 'sticky left-0 z-10 bg-bg-card group-hover:bg-bg-card-hover shadow-[2px_0_5px_-2px_rgba(0,0,0,0.3)] font-semibold' : ''}`}
          style={{ 
            width: cell.column.columnDef.meta?.width,
            minWidth: cell.column.columnDef.meta?.minWidth,
            maxWidth: cell.column.columnDef.meta?.maxWidth,
          }}
        >
          {flexRender(cell.column.columnDef.cell, cell.getContext())}
        </td>
      ))}
    </tr>
  );
}, (prevProps, nextProps) => {
  return prevProps.row.original === nextProps.row.original &&
         prevProps.onRowClick === nextProps.onRowClick;
});

export default function DataTable({ data, columns, onRowClick, pageSize = 15, renderHeader, defaultSort = [] }) {
  const [sorting, setSorting] = useState(defaultSort);
  const isMobile = useMediaQuery('(max-width: 767px)');

  const table = useReactTable({
    data,
    columns,
    state: { sorting },
    onSortingChange: setSorting,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    initialState: {
      pagination: {
        pageSize,
      },
    },
  });

  const paginationControls = table.getPageCount() > 1 ? (
    <div className="flex items-center gap-1.5 text-sm text-text-muted select-none">
      <button
        onClick={() => table.previousPage()}
        disabled={!table.getCanPreviousPage()}
        className="px-3.5 py-1.5 rounded-lg border border-border/60 bg-bg-card hover:bg-bg-card-hover hover:text-text-primary disabled:opacity-40 disabled:hover:bg-bg-card transition-colors cursor-pointer disabled:cursor-not-allowed font-medium text-xs sm:text-sm"
      >
        Previous
      </button>
      
      {Array.from({ length: table.getPageCount() }, (_, i) => {
        const currentPage = table.getState().pagination.pageIndex;
        const totalPages = table.getPageCount();
        
        if (
          i === 0 || 
          i === totalPages - 1 || 
          (i >= currentPage - 1 && i <= currentPage + 1)
        ) {
          const isActive = currentPage === i;
          return (
            <button
              key={i}
              onClick={() => table.setPageIndex(i)}
              className={`px-3 py-1.5 rounded-lg font-bold border transition-all cursor-pointer text-xs sm:text-sm min-w-[32px] sm:min-w-[36px] flex items-center justify-center ${
                isActive
                  ? 'toggle-pill-active'
                  : 'border-border/60 bg-bg-card hover:bg-bg-card-hover hover:text-text-primary text-text-muted'
              }`}
            >
              {i + 1}
            </button>
          );
        }
        
        if (
          (i === 1 && currentPage > 2) ||
          (i === totalPages - 2 && currentPage < totalPages - 3)
        ) {
          return <span key={i} className="px-1 text-text-muted text-sm">...</span>;
        }
        
        return null;
      })}

      <button
        onClick={() => table.nextPage()}
        disabled={!table.getCanNextPage()}
        className="px-3.5 py-1.5 rounded-lg border border-border/60 bg-bg-card hover:bg-bg-card-hover hover:text-text-primary disabled:opacity-40 disabled:hover:bg-bg-card transition-colors cursor-pointer disabled:cursor-not-allowed font-medium text-xs sm:text-sm"
      >
        Next
      </button>
    </div>
  ) : null;

  if (isMobile) {
    return (
      <div className="space-y-4">
        {table.getRowModel().rows?.length ? (
          table.getRowModel().rows.map((row, idx) => (
            <div 
              key={row.id}
              className={`animate-fade-in glass-card p-5 flex flex-col gap-3 ${onRowClick ? 'cursor-pointer active:scale-[0.98] transition-transform' : ''}`}
              style={{ animationDelay: `${Math.min(idx * 30, 200)}ms`, animationFillMode: 'both' }}
              onClick={() => onRowClick && onRowClick(row.original)}
            >
              {row.getVisibleCells().map((cell, idx) => {
                const headerText = typeof cell.column.columnDef.header === 'string' 
                  ? cell.column.columnDef.header 
                  : cell.column.id;
                  
                if (idx === 0) {
                  return (
                    <div key={cell.id} className="font-bold text-base text-text-primary border-b border-border/50 pb-3 mb-1 break-words">
                      {flexRender(cell.column.columnDef.cell, cell.getContext())}
                    </div>
                  );
                }
                
                return (
                  <div key={cell.id} className="flex justify-between items-center gap-4 text-[15px]">
                    <span className="text-text-muted text-xs uppercase tracking-wider font-semibold">{headerText}</span>
                    <div className="text-right font-medium">
                      {flexRender(cell.column.columnDef.cell, cell.getContext())}
                    </div>
                  </div>
                );
              })}
            </div>
          ))
        ) : (
          <div className="glass-card p-8 text-center text-text-muted">
            No results found.
          </div>
        )}

        {table.getPageCount() > 1 && (
          <div className="flex items-center justify-between px-2 py-3 text-sm text-text-muted select-none">
            <button
              onClick={() => table.previousPage()}
              disabled={!table.getCanPreviousPage()}
              className="px-4 py-2 rounded-lg border border-border bg-bg-card disabled:opacity-40 transition-colors cursor-pointer disabled:cursor-not-allowed font-medium"
            >
              Prev
            </button>
            <span>
              Page <span className="font-bold text-text-primary">{table.getState().pagination.pageIndex + 1}</span> of <span className="font-bold text-text-primary">{table.getPageCount()}</span>
            </span>
            <button
              onClick={() => table.nextPage()}
              disabled={!table.getCanNextPage()}
              className="px-4 py-2 rounded-lg border border-border bg-bg-card disabled:opacity-40 transition-colors cursor-pointer disabled:cursor-not-allowed font-medium"
            >
              Next
            </button>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {renderHeader && renderHeader(paginationControls)}

      <div className="w-full overflow-x-auto rounded-xl border border-border bg-bg-card shadow-sm">
        <table className="w-full text-[14.5px] text-left border-collapse">
          <thead className="text-[12.5px] font-semibold text-text-muted bg-bg-secondary border-b border-border">
            {table.getHeaderGroups().map((headerGroup) => (
              <tr key={headerGroup.id} className="border-b border-border">
                {headerGroup.headers.map((header, index) => {
                  return (
                    <th 
                      key={header.id} 
                      className={`px-2.5 sm:px-3 py-3 font-bold tracking-wider whitespace-nowrap cursor-pointer select-none hover:bg-bg-card-hover transition-colors border-b border-border ${index === 0 ? 'sticky left-0 z-20 bg-bg-secondary shadow-[2px_0_5px_-2px_rgba(0,0,0,0.3)]' : ''}`}
                      onClick={header.column.getToggleSortingHandler()}
                      style={{ 
                        width: header.column.columnDef.meta?.width,
                        minWidth: header.column.columnDef.meta?.minWidth,
                        maxWidth: header.column.columnDef.meta?.maxWidth,
                      }}
                    >
                      <div className="flex items-center gap-2">
                        {flexRender(
                          header.column.columnDef.header,
                          header.getContext()
                        )}
                        {header.column.getCanSort() && (
                          <span className="text-text-muted">
                            {{
                              asc: <ArrowUp className="w-3.5 h-3.5" />,
                              desc: <ArrowDown className="w-3.5 h-3.5" />,
                            }[header.column.getIsSorted()] ?? (
                              <ArrowUpDown className="w-3.5 h-3.5 opacity-50" />
                            )}
                          </span>
                        )}
                      </div>
                    </th>
                  );
                })}
              </tr>
            ))}
          </thead>
          <tbody>
            {table.getRowModel().rows?.length ? (
              table.getRowModel().rows.map((row) => (
                <TableRow key={row.id} row={row} onRowClick={onRowClick} />
              ))
            ) : (
              <tr>
                <td colSpan={columns.length} className="px-5 py-8 text-center text-text-muted">
                  No results found.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {table.getCoreRowModel().rows?.length > 0 && (
        <div className="flex flex-col sm:flex-row items-center justify-between gap-4 px-5 py-4 rounded-xl border border-border bg-bg-card text-sm text-text-muted select-none shadow-sm">
          <div>
            Showing{' '}
            <span className="font-bold text-text-primary">
              {table.getState().pagination.pageIndex * table.getState().pagination.pageSize + 1}
            </span>{' '}
            to{' '}
            <span className="font-bold text-text-primary">
              {Math.min(
                (table.getState().pagination.pageIndex + 1) * table.getState().pagination.pageSize,
                table.getCoreRowModel().rows.length
              )}
            </span>{' '}
            of{' '}
            <span className="font-bold text-text-primary">
              {table.getCoreRowModel().rows.length}
            </span>{' '}
            entries
          </div>
          {!renderHeader && paginationControls}
        </div>
      )}
    </div>
  );
}
