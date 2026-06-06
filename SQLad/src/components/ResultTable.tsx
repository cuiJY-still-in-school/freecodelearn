import {
  Box,
  Paper,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Typography,
} from "@mui/material";
import type { QueryResult } from "../api/types";

function renderCell(v: unknown): string {
  if (v === null || v === undefined) return "";
  if (typeof v === "object") return JSON.stringify(v);
  return String(v);
}

export function ResultTable({ result }: { result: QueryResult }) {
  if (result.row_count === 0) {
    return (
      <Typography variant="body2" color="text.secondary">
        查询无结果。
      </Typography>
    );
  }
  return (
    <Box>
      <Typography variant="caption" color="text.secondary" sx={{ pl: 0.5 }}>
        共 {result.row_count} 行
      </Typography>
      <TableContainer
        component={Paper}
        variant="outlined"
        sx={{ mt: 0.5, maxHeight: 460 }}
      >
        <Table size="small" stickyHeader>
          <TableHead>
            <TableRow>
              {result.columns.map((c) => (
                <TableCell key={c} sx={{ fontWeight: 600, fontSize: 12.5 }}>
                  {c}
                </TableCell>
              ))}
            </TableRow>
          </TableHead>
          <TableBody>
            {result.rows.map((row, i) => (
              <TableRow key={i} hover>
                {row.map((v, j) => (
                  <TableCell
                    key={j}
                    sx={{
                      fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
                      fontSize: 12.5,
                      maxWidth: 320,
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {renderCell(v)}
                  </TableCell>
                ))}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableContainer>
    </Box>
  );
}
