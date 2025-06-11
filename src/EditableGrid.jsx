// Code for the EditableGrid component.
import { ModuleRegistry } from 'ag-grid-community';
import { ClientSideRowModelModule } from 'ag-grid-community';
import { AllEnterpriseModule, LicenseManager, RowGroupingModule } from 'ag-grid-enterprise';
ModuleRegistry.registerModules([AllEnterpriseModule, ClientSideRowModelModule, RowGroupingModule]);

LicenseManager.setLicenseKey("[TRIAL]_this_{AG_Charts_and_AG_Grid}_Enterprise_key_{AG-074442}_is_granted_for_evaluation_only___Use_in_production_is_not_permitted___Please_report_misuse_to_legal@ag-grid.com___For_help_with_purchasing_a_production_key_please_contact_info@ag-grid.com___You_are_granted_a_{Single_Application}_Developer_License_for_one_application_only___All_Front-End_JavaScript_developers_working_on_the_application_would_need_to_be_licensed___This_key_will_deactivate_on_{28 February 2025}____[v3]_[0102]_MTc0MDcwMDgwMDAwMA==bb2688d270ed69f72a8ba59760c71424");

// === Imports (Using only the new theming API) ===
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { AgGridReact } from 'ag-grid-react';
import 'ag-grid-community/styles/ag-theme-alpine.css';
import './EditableGrid.css';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogContentText,
  DialogActions,
  Button,
  Snackbar,
  Alert,
  CircularProgress,
} from '@mui/material';

/*
  For local testing, we use static JSON files from the public folder.
  - schema.json returns an object with a "columns" array.
  - data.json returns an array of row objects.
  
  The MDX query strings below are only used to decide which file to load.
*/
const SCHEMA_MDX_QUERY = `
WITH MEMBER [Measures].[Dummy] AS 1
SELECT {[Measures].[Dummy]} ON COLUMNS,
[YourSchemaDimension].Members ON ROWS
FROM [YourCube]
`;

const DATA_MDX_QUERY = `
WITH MEMBER [Measures].[FinalValue] AS
    [Measures].[HistoricalSales] + [Measures].[Adjustment]
SELECT 
    {[Measures].[HistoricalSales], [Measures].[Adjustment]} ON COLUMNS,
    [YourDataDimension].Members ON ROWS
FROM [YourCube]
`;

// Helper: Load JSON from public folder based on MDX query.
async function runMdxQuery(mdxQuery) {
  try {
    const url = mdxQuery.includes("YourSchemaDimension")
      ? "http://localhost:5000/api/schema"
      : "http://localhost:5000/api/data";
    console.log("Fetching URL:", url);
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`MDX query failed: ${response.status}`);
    }
    const jsonResult = await response.json();
    console.log("Fetched JSON:", jsonResult);
    return jsonResult;
  } catch (error) {
    console.error("Error running MDX query:", error);
    throw error;
  }
}

const EditableGrid = () => {
  // State declarations.
  const [rowData, setRowData] = useState(null);
  const [columnDefs, setColumnDefs] = useState(null);
  const [schema, setSchema] = useState(null);
  const [loadingSchema, setLoadingSchema] = useState(false);
  const [loadingData, setLoadingData] = useState(false);
  const [errorDialogOpen, setErrorDialogOpen] = useState(false);
  const [errorDialogMessage, setErrorDialogMessage] = useState('');
  const [snackbarOpen, setSnackbarOpen] = useState(false);
  const [snackbarMessage, setSnackbarMessage] = useState('');
  const [snackbarSeverity, setSnackbarSeverity] = useState('success');

  const gridRef = useRef();

  // Fetch schema on mount.
  useEffect(() => {
    fetchSchema();
  }, []);

  const fetchSchema = async () => {
    setLoadingSchema(true);
    try {
      const schemaData = await runMdxQuery(SCHEMA_MDX_QUERY);
      if (!schemaData || !schemaData.columns) {
        throw new Error("Invalid schema format – missing 'columns' array.");
      }
      setSchema(schemaData);
    } catch (error) {
      setErrorDialogMessage("Error fetching schema. See console for details.");
      setErrorDialogOpen(true);
    } finally {
      setLoadingSchema(false);
    }
  };

  const fetchData = async () => {
    setLoadingData(true);
    try {
      let dataResult = await runMdxQuery(DATA_MDX_QUERY);
      if (!Array.isArray(dataResult)) {
        console.error("Expected data to be an array but got:", dataResult);
        dataResult = dataResult.rows || [];
      }
      setRowData(dataResult);
    } catch (error) {
      setErrorDialogMessage("Error fetching data. See console for details.");
      setErrorDialogOpen(true);
    } finally {
      setLoadingData(false);
    }
  };

  // Generate AG Grid column definitions based on the schema.
  // We now enable pivot, row grouping, and value aggregation for each column.
  const generateColumnDefs = (schemaData) => {
    if (!schemaData || !schemaData.columns) return [];
    return schemaData.columns.map((col) => {
      let colDef = {
        headerName: col.headerName,
        field: col.field,
        editable: !!col.editable,
        cellEditor:
          (['integer', 'float'].includes(col.dataType) && col.editable)
            ? 'agTextCellEditor'
            : undefined,
        cellStyle: col.editable
          ? { backgroundColor: '#FFFFE0' }
          : { backgroundColor: '#D3D3D3' },
        enablePivot: true,
        enableRowGroup: true,
        enableValue: true
      };

      if (col.editable && !col.computed) {
        colDef.valueSetter = (params) => {
          const newValue = params.newValue != null ? params.newValue.toString() : '';
          let isValid = true;
          let errorMsg = '';
          if (col.dataType === "string" && (!newValue || newValue.trim() === "")) {
            isValid = false;
            errorMsg = `${col.headerName} cannot be empty.`;
          } else if (col.dataType === "integer" && !Number.isInteger(Number(newValue))) {
            isValid = false;
            errorMsg = `${col.headerName} must be a whole number.`;
          } else if (col.dataType === "float" && isNaN(newValue)) {
            isValid = false;
            errorMsg = `${col.headerName} must be a number.`;
          }
          if (isValid) {
            params.data[col.field] =
              col.dataType === "integer" ? parseInt(newValue, 10)
              : (col.dataType === "float" ? parseFloat(newValue) : newValue);
            return true;
          } else {
            setErrorDialogMessage(errorMsg);
            setErrorDialogOpen(true);
            return false;
          }
        };
      }

      if (col.computed) {
        colDef.editable = false;
        colDef.valueGetter = (params) => {
          if (!params.data) return null;
          let total = 0;
          if (col.sourceColumns && Array.isArray(col.sourceColumns)) {
            col.sourceColumns.forEach((src) => {
              total += Number(params.data[src] || 0);
            });
          }
          return total;
        };
        colDef.cellStyle = { backgroundColor: '#E8F5E9' };
      }

      return colDef;
    });
  };

  useEffect(() => {
    if (schema) {
      const cols = generateColumnDefs(schema);
      setColumnDefs(cols);
    }
  }, [schema]);

  const onCellValueChanged = useCallback(() => {
    // Optionally mark unsaved changes.
  }, []);

  const doConfirmEdits = async () => {
    if (!rowData || !schema) return;
    const editableFields = schema.columns.filter(col => col.editable && !col.computed).map(col => col.field);
    const updatedRecords = gridRef.current.api.getRenderedNodes().map(node => {
      const record = node.data;
      const updateObj = {};
      if (record.id) updateObj.id = record.id;
      editableFields.forEach(field => {
        updateObj[field] = record[field];
      });
      return updateObj;
    });
    console.log("Update payload:", updatedRecords);
    setSnackbarMessage("Edits saved successfully!");
    setSnackbarSeverity("success");
    setSnackbarOpen(true);
  };

  return (
    <div className="editable-grid-container">
      <h1 className="editable-grid-header">SSAS Cube Editor</h1>
      <div className="editable-grid-button-row">
        {loadingSchema && <CircularProgress size={24} />}
        {!schema && !loadingSchema && (
          <Button variant="contained" onClick={fetchSchema}>Load Schema</Button>
        )}
        {schema && !rowData && !loadingData && (
          <Button variant="contained" onClick={fetchData}>Fetch Data</Button>
        )}
        {loadingData && <CircularProgress size={24} />}
        {rowData && schema && (
          <>
            <Button variant="contained" color="primary" onClick={doConfirmEdits}>
              Confirm Edits
            </Button>
            <Button variant="outlined" onClick={() => setRowData(null)}>
              Close Table
            </Button>
          </>
        )}
      </div>
      {rowData && columnDefs && (
        <div className="editable-grid-table-wrapper">
          <div className="scrollable-table-container">
            <div className="ag-theme-alpine" style={{ height: '100%', width: '100%' }}>
              <AgGridReact
                ref={gridRef}
                rowData={rowData}
                columnDefs={columnDefs}
                defaultColDef={{ resizable: true, sortable: true, filter: true }}
                sideBar={{ toolPanels: ['columns'], defaultToolPanel: 'columns' }}
                popupParent={document.body}
                onGridReady={(params) => {
                  const allColIds = params.columnApi?.getAllColumns()?.map(col => col.getId()) || [];
                  params.columnApi?.autoSizeColumns(allColIds);
                }}
                onCellValueChanged={onCellValueChanged}
                singleClickEdit
                stopEditingWhenCellsLoseFocus
              />
            </div>
          </div>
        </div>
      )}
      <Dialog open={errorDialogOpen} onClose={() => setErrorDialogOpen(false)}>
        <DialogTitle>Error</DialogTitle>
        <DialogContent>
          <DialogContentText>{errorDialogMessage}</DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setErrorDialogOpen(false)} color="primary">OK</Button>
        </DialogActions>
      </Dialog>
      <Snackbar
        open={snackbarOpen}
        autoHideDuration={4000}
        onClose={(event, reason) => { if (reason !== "clickaway") setSnackbarOpen(false); }}
        anchorOrigin={{ vertical: "bottom", horizontal: "center" }}
      >
        <Alert
          onClose={(event, reason) => { if (reason !== "clickaway") setSnackbarOpen(false); }}
          severity={snackbarSeverity}
          sx={{ width: "100%" }}
        >
          {snackbarMessage}
        </Alert>
      </Snackbar>
    </div>
  );
};

export default EditableGrid;

