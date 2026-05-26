"use client";

import { useState, useEffect, useCallback } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { ShoppingCart, Plus, Search, QrCode } from "lucide-react";
import { toast } from "sonner";
import { useDebounce } from "@/hooks/use-debounce";
import { CartProvider, useCart } from "@/components/dispense/cart-context";
import { QuantityDialog } from "@/components/dispense/quantity-dialog";
import { CartDrawer } from "@/components/dispense/cart-drawer";
import { QrScanner } from "@/components/shared/qr-scanner";

interface SearchItem {
  id: string;
  code: string;
  name: string;
  nameTh: string | null;
  availableQty: number;
  issueUnit: string;
  subUnit: string;
  conversionFactor: number;
  trackIndividually: boolean;
  category: { name: string; category: string };
  lots: { id: string; lotNumber: string; expiryDate: string | null; quantity: number }[];
  subItems: { id: string; subCode: string; status: string; condition: string | null }[];
  location: { room: string; cabinet: string | null; shelf: string | null } | null;
}

function DispenseContent() {
  const { itemCount } = useCart();
  const [query, setQuery] = useState("");
  const [items, setItems] = useState<SearchItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedItem, setSelectedItem] = useState<SearchItem | null>(null);
  const [qtyOpen, setQtyOpen] = useState(false);
  const [cartOpen, setCartOpen] = useState(false);
  const [scannerOpen, setScannerOpen] = useState(false);

  const debounced = useDebounce(query, 300);

  const searchItems = useCallback(async (q: string) => {
    setLoading(true);
    try {
      const res = await fetch(`/api/dispense/items?q=${encodeURIComponent(q)}&limit=30`);
      const data = await res.json();
      setItems(data.items ?? []);
    } catch {
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    searchItems(debounced);
  }, [debounced, searchItems]);

  const handleAdd = (item: SearchItem) => {
    setSelectedItem(item);
    setQtyOpen(true);
  };

  const handleQrScan = async (code: string) => {
    setLoading(true);
    try {
      const res = await fetch(`/api/dispense/items?q=${encodeURIComponent(code)}&limit=1`);
      const data = await res.json();
      const found = data.items?.[0] as SearchItem | undefined;
      if (found && found.code === code) {
        handleAdd(found);
      } else {
        toast.error(`Item "${code}" not found`);
      }
    } catch {
      toast.error("Search failed");
    } finally {
      setLoading(false);
    }
  };

  const categoryColor = (cat: string) => {
    switch (cat) {
      case "CONSUMABLE": return "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200";
      case "DURABLE": return "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200";
      case "FIXED_ASSET": return "bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200";
      case "BOOK": return "bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200";
      default: return "";
    }
  };

  return (
    <div className="flex flex-col h-[calc(100vh-8rem)]">
      <div className="flex items-center gap-2 px-1 mb-4">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search by code or name..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="pl-9"
          />
        </div>
        <Button variant="outline" size="icon" title="Scan QR" onClick={() => setScannerOpen(true)}>
          <QrCode className="h-4 w-4" />
        </Button>
      </div>

      <div className="flex-1 overflow-y-auto space-y-2">
        {loading ? (
          Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-16 w-full rounded-lg" />
          ))
        ) : items.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-8">
            {query ? "No items found" : "Type to search items"}
          </p>
        ) : (
          items.map((item) => (
            <div
              key={item.id}
              className="flex items-center gap-3 rounded-lg border p-3 hover:bg-muted/50 transition-colors"
            >
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="font-mono text-xs text-muted-foreground">{item.code}</span>
                  <Badge className={`text-[10px] ${categoryColor(item.category.category)}`}>
                    {item.category.name}
                  </Badge>
                </div>
                <p className="text-sm font-medium truncate">{item.name}</p>
                <p className="text-xs text-muted-foreground">
                  Available: {item.trackIndividually
                    ? `${item.subItems.length} units`
                    : `${item.availableQty} ${item.issueUnit}`}
                  {item.location && ` · ${item.location.room}${item.location.cabinet ? ` / ${item.location.cabinet}` : ""}`}
                </p>
              </div>
              <Button
                size="icon"
                variant="outline"
                className="shrink-0"
                onClick={() => handleAdd(item)}
                disabled={!item.trackIndividually && item.availableQty <= 0}
              >
                <Plus className="h-4 w-4" />
              </Button>
            </div>
          ))
        )}
      </div>

      {/* FAB */}
      {itemCount > 0 && (
        <Button
          size="lg"
          className="fixed bottom-20 right-6 rounded-full h-14 w-14 shadow-lg z-40 md:bottom-6"
          onClick={() => setCartOpen(true)}
        >
          <ShoppingCart className="h-5 w-5" />
          <Badge className="absolute -top-1 -right-1 h-5 w-5 rounded-full p-0 flex items-center justify-center text-[10px]">
            {itemCount}
          </Badge>
        </Button>
      )}

      <QuantityDialog
        item={selectedItem}
        open={qtyOpen}
        onClose={() => { setQtyOpen(false); setSelectedItem(null); }}
      />

      <CartDrawer
        open={cartOpen}
        onClose={() => setCartOpen(false)}
        onDone={() => setCartOpen(false)}
      />

      <QrScanner
        open={scannerOpen}
        onClose={() => setScannerOpen(false)}
        onScan={handleQrScan}
      />
    </div>
  );
}

export default function DispensePage() {
  return (
    <CartProvider>
      <DispenseContent />
    </CartProvider>
  );
}
