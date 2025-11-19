import React, { useState, useEffect } from 'react';
import { SpinnerIcon, TrashIcon, CopyIcon } from '../../components/icons';
import ConfirmDeleteModal from './components/ConfirmDeleteModal';
import { debugFetch } from '../../lib/debugApi';

interface TablesPageProps {
  showToast: (message: string, type: 'success' | 'error') => void;
}

interface TableData {
  faqs: any[];
  media: any[];
  users: any[];
  conversations: any[];
  messages: any[];
  logs: any[];
  reports: any[];
}

const TablesPage: React.FC<TablesPageProps> = ({ showToast }) => {
  const [tableData, setTableData] = useState<TableData>({
    faqs: [],
    media: [],
    users: [],
    conversations: [],
    messages: [],
    logs: [],
    reports: [],
  });
  const [activeTab, setActiveTab] = useState<keyof TableData>('faqs');
  const [visibleColumns, setVisibleColumns] = useState<Record<string, Set<string>>>({});
  const [deletingRow, setDeletingRow] = useState<string | null>(null);
  const [deletingColumn, setDeletingColumn] = useState<string | null>(null);
  const [copyingRow, setCopyingRow] = useState<string | null>(null);
  const [editingCell, setEditingCell] = useState<{ table: string; rowId: any; column: string } | null>(null);
  const [editValue, setEditValue] = useState<string>('');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [deleteModalState, setDeleteModalState] = useState<{ isOpen: boolean; table: string; rowId: any; idColumn: string } | null>(null);
  const [deleteColumnModalState, setDeleteColumnModalState] = useState<{ isOpen: boolean; table: string; column: string } | null>(null);
  const itemsPerPage = 25;

  const fetchTables = async () => {
    try {
      const response = await debugFetch('/api/debug/tables');
      const data = await response.json();
      setTableData(data);
    } catch (error: any) {
      console.error('Error fetching tables:', error);
      showToast('Failed to load table data', 'error');
    }
  };

  useEffect(() => {
    fetchTables();
  }, []);

  const deleteRow = async (tableName: keyof TableData, rowId: any, idColumn: string) => {
    const rowIdStr = `${tableName}-${rowId}`;
    setDeleteModalState({ isOpen: true, table: tableName, rowId, idColumn });

    // The actual deletion will happen in the modal's onConfirm
  };

  const handleConfirmDeleteRow = async () => {
    if (!deleteModalState) return;
    
    const { table, rowId, idColumn } = deleteModalState;
    const rowIdStr = `${table}-${rowId}`;
    
    setDeletingRow(rowIdStr);
    try {
      const response = await debugFetch('/api/debug/delete-row', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ table, idColumn, id: rowId }),
      });

      if (!response.ok) throw new Error('Failed to delete row');

      setTableData(prev => {
        const newData = { ...prev };
        const tableArray = [...newData[table as keyof TableData]];
        const filtered = tableArray.filter((row: any) => row[idColumn] !== rowId);
        newData[table as keyof TableData] = filtered as any;
        return newData;
      });
      
      setDeleteModalState(null);
    } catch (error: any) {
      console.error('Error deleting row:', error);
      showToast('Failed to delete row', 'error');
      fetchTables();
    } finally {
      setDeletingRow(null);
    }
  };

  const copyRow = async (tableName: keyof TableData, rowId: any, idColumn: string) => {
    const rowIdStr = `${tableName}-${rowId}`;
    setCopyingRow(rowIdStr);
    try {
      const response = await debugFetch('/api/debug/copy-row', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ table: tableName, idColumn, id: rowId }),
      });

      if (!response.ok) throw new Error('Failed to copy row');

      const result = await response.json();
      
      setTableData(prev => {
        const newData = { ...prev };
        const tableArray = [...newData[tableName as keyof TableData]];
        tableArray.push(result.newRow);
        newData[tableName as keyof TableData] = tableArray as any;
        return newData;
      });
    } catch (error: any) {
      console.error('Error copying row:', error);
      showToast('Failed to copy row', 'error');
    } finally {
      setCopyingRow(null);
    }
  };

  const startEditing = (tableName: string, rowId: any, column: string, currentValue: any) => {
    if (column === 'created_at' || column === 'embedding') {
      return;
    }
    
    let valueStr = '';
    if (currentValue === null || currentValue === undefined) {
      valueStr = '';
    } else if (Array.isArray(currentValue)) {
      valueStr = currentValue.join(', ');
    } else if (typeof currentValue === 'object') {
      valueStr = JSON.stringify(currentValue);
    } else {
      valueStr = String(currentValue);
    }
    
    setEditingCell({ table: tableName, rowId, column });
    setEditValue(valueStr);
  };

  const cancelEditing = () => {
    setEditingCell(null);
    setEditValue('');
  };

  const saveCell = async (tableName: string, rowId: any, column: string, idColumn: string, originalValue: any) => {
    let originalStr = '';
    if (originalValue === null || originalValue === undefined) {
      originalStr = '';
    } else if (Array.isArray(originalValue)) {
      originalStr = originalValue.join(', ');
    } else if (typeof originalValue === 'object') {
      originalStr = JSON.stringify(originalValue);
    } else {
      originalStr = String(originalValue);
    }

    if (editValue.trim() === originalStr.trim()) {
      setEditingCell(null);
      setEditValue('');
      return;
    }

    try {
      const response = await debugFetch('/api/debug/update-cell', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          table: tableName,
          idColumn,
          id: rowId,
          column,
          value: editValue,
        }),
      });

      if (!response.ok) throw new Error('Failed to update cell');

      setTableData(prev => {
        const newData = { ...prev };
        const tableArray = [...newData[tableName as keyof TableData]];
        const rowIndex = tableArray.findIndex((row: any) => row[idColumn] === rowId);
        if (rowIndex !== -1) {
          tableArray[rowIndex] = { ...tableArray[rowIndex], [column]: editValue };
          newData[tableName as keyof TableData] = tableArray as any;
        }
        return newData;
      });

      setEditingCell(null);
      setEditValue('');
    } catch (error: any) {
      console.error('Error updating cell:', error);
      showToast('Failed to update cell', 'error');
    }
  };

  const toggleColumn = (tableName: string, column: string) => {
    setVisibleColumns((prev) => {
      const newState = { ...prev };
      if (!newState[tableName]) {
        newState[tableName] = new Set();
      }
      const columns = new Set(newState[tableName]);
      if (columns.has(column)) {
        columns.delete(column);
      } else {
        columns.add(column);
      }
      newState[tableName] = columns;
      return newState;
    });
  };

  const deleteColumn = async (tableName: keyof TableData, column: string) => {
    setDeleteColumnModalState({ isOpen: true, table: tableName, column });
  };

  const handleConfirmDeleteColumn = async () => {
    if (!deleteColumnModalState) return;
    
    const { table, column } = deleteColumnModalState;
    const columnKey = `${table}-${column}`;
    
    setDeletingColumn(columnKey);
    try {
      const response = await debugFetch('/api/debug/delete-column', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ table, column }),
      });

      if (!response.ok) {
        const error = await response.json().catch(() => ({ error: 'Failed to delete column' }));
        throw new Error(error.error || 'Failed to delete column');
      }

      setTableData(prev => {
        const newData = { ...prev };
        const tableArray = [...newData[table as keyof TableData]];
        const updated = tableArray.map((row: any) => {
          const { [column]: removed, ...rest } = row;
          return rest;
        });
        newData[table as keyof TableData] = updated as any;
        return newData;
      });
      
      setDeleteColumnModalState(null);
    } catch (error: any) {
      console.error('Error deleting column:', error);
      showToast(`Failed to delete column: ${error.message}`, 'error');
      fetchTables();
    } finally {
      setDeletingColumn(null);
    }
  };

  const getTableIdColumn = (tableName: keyof TableData): string => {
    const idColumns: Record<string, string> = {
      faqs: 'id',
      media: 'id',
      users: 'id',
      conversations: 'id',
      messages: 'id',
      logs: 'id',
      reports: 'id',
    };
    return idColumns[tableName] || 'id';
  };

  const filterData = (data: any[], query: string): any[] => {
    if (!query.trim()) return data;
    const lowerQuery = query.toLowerCase();
    return data.filter(row => {
      return Object.values(row).some(value => {
        if (value === null || value === undefined) return false;
        const strValue = Array.isArray(value) 
          ? JSON.stringify(value).toLowerCase()
          : String(value).toLowerCase();
        return strValue.includes(lowerQuery);
      });
    });
  };

  useEffect(() => {
    setCurrentPage(1);
  }, [searchQuery, activeTab]);

  const renderTable = (tableName: keyof TableData) => {
    const data = tableData[tableName];
    if (!data || data.length === 0) {
      return (
        <div className="text-center py-8 text-text-secondary">
          No data in {tableName} table
        </div>
      );
    }

    const filteredData = filterData(data, searchQuery);
    const totalPages = Math.ceil(filteredData.length / itemsPerPage);
    const startIndex = (currentPage - 1) * itemsPerPage;
    const endIndex = startIndex + itemsPerPage;
    const paginatedData = filteredData.slice(startIndex, endIndex);
    
    const allColumns = Object.keys(data[0]);
    const hiddenColumns = visibleColumns[tableName] || new Set();
    const columns = allColumns.filter((col) => !hiddenColumns.has(col));
    const idColumn = getTableIdColumn(tableName);

    const hiddenCols = allColumns.filter((col) => hiddenColumns.has(col));

    return (
      <div>
        {hiddenCols.length > 0 && (
          <div className="mb-2 flex flex-wrap gap-2">
            <span className="text-xs text-text-secondary/70 self-center">Hidden:</span>
            {hiddenCols.map((col) => (
              <label
                key={col}
                className="flex items-center gap-1 cursor-pointer px-2 py-1 bg-surface-light border border-border rounded text-xs"
              >
                <input
                  type="checkbox"
                  checked={false}
                  onChange={() => toggleColumn(tableName, col)}
                  className="w-3 h-3 text-primary focus:ring-primary"
                />
                <span className="text-text-secondary/70">{col}</span>
              </label>
            ))}
          </div>
        )}

        <div className="overflow-x-auto -mx-3 sm:mx-0">
          <table className="w-full border-collapse min-w-full">
            <thead>
              <tr className="bg-surface-light border-b border-border">
                {columns.map((col) => {
                  const columnKey = `${tableName}-${col}`;
                  const isDeleting = deletingColumn === columnKey;
                  return (
                    <th
                      key={col}
                      className="px-2 sm:px-4 py-2 sm:py-3 text-left text-xs sm:text-sm font-semibold text-text-primary"
                    >
                      <div className="flex items-center gap-1 sm:gap-2">
                        <label className="flex items-center gap-1 sm:gap-1.5 cursor-pointer flex-1 min-w-0">
                          <input
                            type="checkbox"
                            checked={true}
                            onChange={() => toggleColumn(tableName, col)}
                            className="w-3 h-3 sm:w-3.5 sm:h-3.5 text-primary focus:ring-primary flex-shrink-0"
                          />
                          <span className="text-text-primary truncate">{col}</span>
                        </label>
                        <button
                          onClick={() => deleteColumn(tableName, col)}
                          disabled={isDeleting}
                          className="p-0.5 sm:p-1 bg-accent/20 text-accent rounded hover:bg-accent/40 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex-shrink-0"
                          title="Delete column from database"
                        >
                          {isDeleting ? (
                            <SpinnerIcon className="w-3 h-3 sm:w-4 sm:h-4" />
                          ) : (
                            <TrashIcon className="w-3 h-3 sm:w-4 sm:h-4" />
                          )}
                        </button>
                      </div>
                    </th>
                  );
                })}
                <th className="px-2 sm:px-4 py-2 sm:py-3 text-left text-xs sm:text-sm font-semibold text-text-primary w-20 sm:w-32">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody>
              {paginatedData.map((row, idx) => {
                const rowId = row[idColumn];
                const rowIdStr = `${tableName}-${rowId}`;
                const isDeleting = deletingRow === rowIdStr;
                return (
                  <tr
                    key={idx}
                    className="border-b border-border hover:bg-surface-light transition-colors"
                  >
                    {columns.map((col) => {
                      const value = row[col];
                      const isEditing = editingCell?.table === tableName && 
                                       editingCell?.rowId === rowId && 
                                       editingCell?.column === col;
                      const isEditable = col !== 'created_at' && col !== 'embedding';

                      if (isEditing) {
                        return (
                          <td key={col} className="px-4 py-3">
                            <div className="flex items-center gap-2">
                              <input
                                type="text"
                                value={editValue}
                                onChange={(e) => setEditValue(e.target.value)}
                                onKeyDown={(e) => {
                                  if (e.key === 'Enter') {
                                    saveCell(tableName, rowId, col, idColumn, row[col]);
                                  } else if (e.key === 'Escape') {
                                    cancelEditing();
                                  }
                                }}
                                onBlur={() => saveCell(tableName, rowId, col, idColumn, row[col])}
                                autoFocus
                                className="w-full px-2 py-1 bg-surface-light border border-primary rounded text-sm text-text-primary focus:outline-none focus:ring-2 focus:ring-primary"
                              />
                            </div>
                          </td>
                        );
                      }

                      let displayValue: React.ReactNode = value;

                      if (value === null || value === undefined) {
                        displayValue = <span className="text-text-secondary/50">null</span>;
                      } else if (Array.isArray(value)) {
                        if (value.length === 0) {
                          displayValue = <span className="text-text-secondary/50">[]</span>;
                        } else if (col === 'embedding' && value.length > 0) {
                          displayValue = (
                            <span className="text-xs text-text-secondary">
                              [{value.length} dimensions]
                            </span>
                          );
                        } else {
                          displayValue = (
                            <span className="text-xs text-text-secondary">
                              [{value.join(', ')}]
                            </span>
                          );
                        }
                      } else if (typeof value === 'object') {
                        displayValue = (
                          <span className="text-xs text-text-secondary">
                            {JSON.stringify(value)}
                          </span>
                        );
                      } else if (typeof value === 'string' && value.length > 100) {
                        displayValue = (
                          <span className="text-xs text-text-secondary">
                            {value.substring(0, 100)}...
                          </span>
                        );
                      }

                      return (
                        <td
                          key={col}
                          onClick={() => isEditable && startEditing(tableName, rowId, col, value)}
                          className={`px-2 sm:px-4 py-2 sm:py-3 text-xs sm:text-sm text-text-secondary ${
                            isEditable ? 'cursor-pointer hover:bg-surface-light/50 transition-colors' : ''
                          }`}
                          title={isEditable ? 'Click to edit' : ''}
                        >
                          {displayValue}
                        </td>
                      );
                    })}
                    <td className="px-2 sm:px-4 py-2 sm:py-3">
                      <div className="flex items-center gap-1 sm:gap-2">
                        <button
                          onClick={() => copyRow(tableName, rowId, idColumn)}
                          disabled={copyingRow === rowIdStr}
                          className="p-1 sm:p-2 bg-primary/20 text-primary rounded-md hover:bg-primary/40 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                          title="Copy row"
                        >
                          {copyingRow === rowIdStr ? <SpinnerIcon className="w-3 h-3 sm:w-4 sm:h-4" /> : <CopyIcon className="w-3 h-3 sm:w-4 sm:h-4" />}
                        </button>
                        <button
                          onClick={() => deleteRow(tableName, rowId, idColumn)}
                          disabled={isDeleting}
                          className="p-1 sm:p-2 bg-accent/20 text-accent rounded-md hover:bg-accent/40 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                          title="Delete row"
                        >
                          {isDeleting ? <SpinnerIcon className="w-3 h-3 sm:w-4 sm:h-4" /> : <TrashIcon className="w-3 h-3 sm:w-4 sm:h-4" />}
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {totalPages > 1 && (
          <div className="mt-3 sm:mt-4 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2 sm:gap-0">
            <div className="text-xs sm:text-sm text-text-secondary text-center sm:text-left">
              Showing {startIndex + 1} to {Math.min(endIndex, filteredData.length)} of {filteredData.length} entries
            </div>
            <div className="flex items-center justify-center gap-2">
              <button
                onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
                disabled={currentPage === 1}
                className="px-2 sm:px-3 py-1.5 text-xs sm:text-sm rounded-md bg-surface-light border border-border text-text-primary font-semibold hover:bg-surface transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Previous
              </button>
              <span className="text-xs sm:text-sm text-text-secondary px-2">
                Page {currentPage} of {totalPages}
              </span>
              <button
                onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
                disabled={currentPage === totalPages}
                className="px-2 sm:px-3 py-1.5 text-xs sm:text-sm rounded-md bg-surface-light border border-border text-text-primary font-semibold hover:bg-surface transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Next
              </button>
            </div>
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="min-h-screen bg-background p-2 sm:p-4 md:p-8">
      <div className="max-w-7xl mx-auto">
        <div className="mb-4 sm:mb-6">
          <h1 className="text-xl sm:text-2xl md:text-3xl font-bold text-text-primary mb-1 sm:mb-2">Database Tables</h1>
          <p className="text-sm sm:text-base text-text-secondary">View and manage all database tables</p>
        </div>

        <div className="bg-surface rounded-xl border border-border overflow-hidden mb-4 sm:mb-6">
          <div className="border-b border-border flex overflow-x-auto">
            {(['faqs', 'media', 'users', 'conversations', 'messages', 'logs', 'reports'] as const).map((tab) => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className={`px-3 sm:px-6 py-2 sm:py-4 text-xs sm:text-base font-semibold transition-colors whitespace-nowrap ${
                  activeTab === tab
                    ? 'text-primary border-b-2 border-primary bg-surface-light'
                    : 'text-text-secondary hover:text-text-primary hover:bg-surface-light'
                }`}
              >
                <span className="hidden sm:inline">{tab.charAt(0).toUpperCase() + tab.slice(1)}</span>
                <span className="sm:hidden">{tab.charAt(0).toUpperCase()}</span>
                <span className="ml-1">({tableData[tab]?.length || 0})</span>
              </button>
            ))}
          </div>

          <div className="p-3 sm:p-6">
            <div className="mb-3 sm:mb-4 space-y-2 sm:space-y-3">
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder={`Search ${activeTab}...`}
                  className="flex-1 bg-surface-light border border-border rounded-md py-2 px-3 sm:px-4 text-sm sm:text-base focus:outline-none focus:ring-2 focus:ring-primary text-text-primary"
                />
                <button
                  onClick={() => {
                    fetchTables();
                    showToast('Tables refreshed from database', 'success');
                  }}
                  className="px-3 py-2 text-xs sm:text-sm rounded-md bg-primary text-background font-semibold hover:bg-primary-hover transition-colors whitespace-nowrap"
                  title="Refresh/Update"
                >
                  Refresh/Update
                </button>
                {searchQuery && (
                  <span className="text-xs sm:text-sm text-text-secondary whitespace-nowrap hidden sm:inline">
                    {filterData(tableData[activeTab], searchQuery).length} of {tableData[activeTab]?.length || 0} results
                  </span>
                )}
              </div>
              {searchQuery && (
                <span className="text-xs sm:text-sm text-text-secondary sm:hidden">
                  {filterData(tableData[activeTab], searchQuery).length} of {tableData[activeTab]?.length || 0} results
                </span>
              )}
            </div>
            {renderTable(activeTab)}
          </div>
        </div>
      </div>

      <ConfirmDeleteModal
        isOpen={deleteModalState?.isOpen || false}
        onClose={() => setDeleteModalState(null)}
        onConfirm={handleConfirmDeleteRow}
        title="Delete Row?"
        message={`Are you sure you want to delete this row from ${deleteModalState?.table}? This action cannot be undone.`}
      />

      <ConfirmDeleteModal
        isOpen={deleteColumnModalState?.isOpen || false}
        onClose={() => setDeleteColumnModalState(null)}
        onConfirm={handleConfirmDeleteColumn}
        title="Delete Column?"
        message={`⚠️ WARNING: This will PERMANENTLY DELETE the column "${deleteColumnModalState?.column}" from the "${deleteColumnModalState?.table}" table in the database!\n\nThis action CANNOT be undone and will delete ALL data in this column for ALL rows.`}
      />
    </div>
  );
};

export default TablesPage;

