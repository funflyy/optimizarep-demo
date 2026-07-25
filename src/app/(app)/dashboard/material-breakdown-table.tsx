import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";

interface MaterialRow {
  materialClass: string;
  materialDetail: string;
  pieceCount: number;
  totalWeightGrams: number;
  wasteType: string;
}

export function MaterialBreakdownTable({ data }: { data: MaterialRow[] }) {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Material</TableHead>
          <TableHead>Detalle</TableHead>
          <TableHead className="text-center">Piezas</TableHead>
          <TableHead className="text-right">Peso Total (g)</TableHead>
          <TableHead className="text-center">Residuo</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {data.map((row, i) => (
          <TableRow key={`${row.materialClass}-${row.materialDetail}-${i}`}>
            <TableCell className="font-medium">
              {row.materialClass}
            </TableCell>
            <TableCell>{row.materialDetail}</TableCell>
            <TableCell className="text-center">{row.pieceCount}</TableCell>
            <TableCell className="text-right font-mono">
              {Number(row.totalWeightGrams).toLocaleString("es-CL")}
            </TableCell>
            <TableCell className="text-center">
              <Badge
                variant={
                  row.wasteType === "recyclable" ? "default" : "destructive"
                }
                className={
                  row.wasteType === "recyclable"
                    ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-900 dark:text-emerald-200"
                    : ""
                }
              >
                {row.wasteType === "recyclable"
                  ? "Reciclable"
                  : "No Reciclable"}
              </Badge>
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
