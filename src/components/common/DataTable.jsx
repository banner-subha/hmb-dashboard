import {
  flexRender,
  getCoreRowModel,
  getSortedRowModel,
  getPaginationRowModel,
  useReactTable,
} from '@tanstack/react-table';
import { useState } from 'react';
import { ArrowDown, ArrowUp, ArrowUpDown } from 'lucide-react';
import { useMediaQuery } from '../../hooks/useMediaQuery';

export default function DataTable({ data, columns, onRowClick, pageSize = 15, renderHeader }) {
  const [sorting, setSorting] = useState([]);
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
    <div className="flex items-center gap-1 text-xs text-text-muted select-none">
      <button
        onClick={() => table.previousPage()}
        disabled={!table.getCanPreviousPage()}
        className="px-3 py-1.5 rounded border border-border bg-bg-card hover:bg-bg-card-hover disabled:opacity-50 disabled:hover:bg-bg-card transition-colors cursor-pointer disabled:cursor-not-allowed font-medium animate-transition"
      >
        Previous
      </button>
      
      {/* Page Numbers */}
      {Array.from({ length: table.getPageCount() }, (_, i) => {
        const currentPage = table.getState().pagination.pageIndex;
        const totalPages = table.getPageCount();
        
        if (
          i === 0 || 
          i === totalPages - 1 || 
          (i >= currentPage - 1 && i <= currentPage + 1)
        ) {
          return (
            <button
              key={i}
              onClick={() => table.setPageIndex(i)}
              className={`px-3 py-1.5 rounded font-bold border transition-colors cursor-pointer ${
                currentPage === i
                  ? 'bg-accent-blue border-accent-blue text-white font-extrabold'
                  : 'border-border bg-bg-card hover:bg-bg-card-hover text-text-muted'
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
          return <span key={i} className="px-1 text-text-muted">...</span>;
        }
        
        return null;
      })}

      <button
        onClick={() => table.nextPage()}
        disabled={!table.getCanNextPage()}
        className="px-3 py-1.5 rounded border border-border bg-bg-card hover:bg-bg-card-hover disabled:opacity-50 disabled:hover:bg-bg-card transition-colors cursor-pointer disabled:cursor-not-allowed font-medium animate-transition"
      >
        Next
      </button>
    </div>
  ) : null;

  if (isMobile) {
    return (
      <div className="space-y-4">
        {table.getRowModel().rows?.length ? (
          table.getRowModel().rows.map((row) => (
            <div 
              key={row.id}
              className={`glass-card p-4 flex flex-col gap-3 ${onRowClick ? 'cursor-pointer active:scale-[0.98] transition-transform' : ''}`}
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
                  <div key={cell.id} className="flex justify-between items-center gap-4 text-sm">
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

        {/* Mobile Pagination Controls */}
        {table.getPageCount() > 1 && (
          <div className="flex items-center justify-between px-2 py-3 text-xs text-text-muted select-none">
            <button
              onClick={() => table.previousPage()}
              disabled={!table.getCanPreviousPage()}
              className="px-3 py-1.5 rounded border border-border bg-bg-card disabled:opacity-50 transition-colors cursor-pointer disabled:cursor-not-allowed font-medium"
            >
              Prev
            </button>
            <span>
              Page <span className="font-bold text-text-primary">{table.getState().pagination.pageIndex + 1}</span> of <span className="font-bold text-text-primary">{table.getPageCount()}</span>
            </span>
            <button
              onClick={() => table.nextPage()}
              disabled={!table.getCanNextPage()}
              className="px-3 py-1.5 rounded border border-border bg-bg-card disabled:opacity-50 transition-colors cursor-pointer disabled:cursor-not-allowed font-medium"
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

      <div className="w-full overflow-x-auto rounded-lg border border-border bg-bg-card">
        <table className="w-full text-sm text-left">
          <thead className="text-xs text-text-muted uppercase bg-bg-secondary border-b border-border">
            {table.getHeaderGroups().map((headerGroup) => (
              <tr key={headerGroup.id}>
                {headerGroup.headers.map((header, index) => {
                  return (
                    <th 
                      key={header.id} 
                      className={`px-4 py-3 font-semibold tracking-wider whitespace-nowrap cursor-pointer select-none hover:bg-bg-card-hover transition-colors ${index === 0 ? 'sticky left-0 z-20 bg-bg-secondary shadow-[2px_0_5px_-2px_rgba(0,0,0,0.3)]' : ''}`}
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
                              asc: <ArrowUp className="w-3 h-3" />,
                              desc: <ArrowDown className="w-3 h-3" />,
                            }[header.column.getIsSorted()] ?? (
                              <ArrowUpDown className="w-3 h-3 opacity-50" />
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
          <tbody className="divide-y divide-border">
            {table.getRowModel().rows?.length ? (
              table.getRowModel().rows.map((row) => (
                <tr 
                  key={row.id}
                  onClick={() => onRowClick && onRowClick(row.original)}
                  className={`transition-colors bg-bg-card hover:bg-bg-card-hover ${onRowClick ? 'cursor-pointer' : ''}`}
                >
                  {row.getVisibleCells().map((cell, index) => (
                    <td 
                      key={cell.id} 
                      className={`px-4 py-3 ${index === 0 ? 'sticky left-0 z-10 bg-inherit shadow-[2px_0_5px_-2px_rgba(0,0,0,0.3)] font-medium' : ''}`}
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
              ))
            ) : (
              <tr>
                <td colSpan={columns.length} className="px-4 py-8 text-center text-text-muted">
                  No results found.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Desktop Pagination Controls */}
      {table.getFilteredRowModel().rows?.length > 0 && (
        <div className="flex flex-col sm:flex-row items-center justify-between gap-4 px-4 py-3 rounded-lg border border-border bg-bg-card text-xs text-text-muted select-none">
          <div>
            Showing{' '}
            <span className="font-bold text-text-primary">
              {table.getState().pagination.pageIndex * table.getState().pagination.pageSize + 1}
            </span>{' '}
            to{' '}
            <span className="font-bold text-text-primary">
              {Math.min(
                (table.getState().pagination.pageIndex + 1) * table.getState().pagination.pageSize,
                table.getFilteredRowModel().rows.length
              )}
            </span>{' '}
            of{' '}
            <span className="font-bold text-text-primary">
              {table.getFilteredRowModel().rows.length}
            </span>{' '}
            entries
          </div>
          {!renderHeader && paginationControls}
        </div>
      )}
    </div>
  );
}
