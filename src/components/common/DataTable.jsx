import {
  flexRender,
  getCoreRowModel,
  getSortedRowModel,
  useReactTable,
} from '@tanstack/react-table';
import { useState } from 'react';
import { ArrowDown, ArrowUp, ArrowUpDown } from 'lucide-react';
import { useMediaQuery } from '../../hooks/useMediaQuery';

export default function DataTable({ data, columns, onRowClick }) {
  const [sorting, setSorting] = useState([]);
  const isMobile = useMediaQuery('(max-width: 767px)');

  const table = useReactTable({
    data,
    columns,
    state: { sorting },
    onSortingChange: setSorting,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
  });

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
      </div>
    );
  }

  return (
    <div className="w-full overflow-x-auto rounded-lg border border-border bg-bg-card">
      <table className="w-full text-sm text-left table-fixed">
        <thead className="text-xs text-text-muted uppercase bg-bg-secondary border-b border-border">
          {table.getHeaderGroups().map((headerGroup) => (
            <tr key={headerGroup.id}>
              {headerGroup.headers.map((header, index) => {
                return (
                  <th 
                    key={header.id} 
                    className={`px-4 py-3 font-semibold tracking-wider whitespace-nowrap cursor-pointer select-none hover:bg-bg-card-hover transition-colors ${index === 0 ? 'sticky left-0 z-20 bg-bg-secondary shadow-[2px_0_5px_-2px_rgba(0,0,0,0.3)]' : ''}`}
                    onClick={header.column.getToggleSortingHandler()}
                    style={{ width: header.column.columnDef.meta?.width }}
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
                    style={{ width: cell.column.columnDef.meta?.width }}
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
  );
}
