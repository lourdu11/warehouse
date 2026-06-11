import { useState, useEffect, useCallback } from "react";
import { Card, CardContent } from "../components/ui/card";
import { ChevronRight, Plus, Pencil, Loader2 } from "lucide-react";
import { Button } from "../components/ui/button";
import { useToast } from "../components/ui/use-toast";
import { getWarehouse, listInventory } from "../services/apiService";

// Normalise any API response to a plain array
const toArray = (res, knownKey = null) => {
  if (!res) return [];
  if (Array.isArray(res)) return res;
  if (knownKey && Array.isArray(res[knownKey])) return res[knownKey];
  for (const key of ["results", "data", "items"]) {
    if (Array.isArray(res[key])) return res[key];
  }
  return Object.values(res).find(Array.isArray) || [];
};

// ✅ No <AppLayout> — layout is provided by the router via <Outlet>
export default function WarehousesPage() {
  const { toast } = useToast();
  const [isLoading, setIsLoading] = useState(true);
  const [warehouse, setWarehouse] = useState(null);
  const [inventoryLocations, setInventoryLocations] = useState([]);
  const [path, setPath] = useState({});

  const loadWarehouseAndInventory = useCallback(async () => {
    setIsLoading(true);
    try {
      // ✅ Use allSettled so a failed listInventory doesn't kill the warehouse display
      const [whResult, invResult] = await Promise.allSettled([
        getWarehouse(),
        listInventory(),
      ]);

      if (whResult.status === "fulfilled") {
        setWarehouse(whResult.value);
      }

      // ✅ FIX: listInventory() is a fallback that returns { products: [...] } from
      // /products/listall/ — those product objects have no zone/shelf/bin fields.
      // We normalise the response and gracefully handle missing location fields.
      const rawInventory = invResult.status === "fulfilled"
        ? toArray(invResult.value, "products")
        : [];

      // Group by zone — falls back to "Default Zone" if zone data is absent
      const zones = {};
      rawInventory.forEach((item) => {
        const zone = item.zone_name || item.location || "Default Zone";
        if (!zones[zone]) zones[zone] = [];
        zones[zone].push(item);
      });

      const zoneList = Object.keys(zones).map((zone) => ({
        name: zone,
        items: zones[zone],
        // Collect unique shelf names; filter out nulls
        shelves: [...new Set(zones[zone].map((i) => i.shelf_name).filter(Boolean))],
      }));

      setInventoryLocations(zoneList);
    } catch (error) {
      console.error("Failed to load warehouse data:", error);
      toast({
        title: "Error",
        description: "Failed to load warehouse data.",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    loadWarehouseAndInventory();
  }, [loadWarehouseAndInventory]);

  // ─── Breadcrumb + navigation ─────────────────────────────────────────────
  const { zoneIdx, shelfIdx } = path;

  const breadcrumbs = [{ label: "Warehouses", onClick: () => setPath({}) }];

  if (zoneIdx !== undefined && inventoryLocations[zoneIdx]) {
    const zone = inventoryLocations[zoneIdx];
    // ✅ FIX: was setting { warehouseIdx: 0 } instead of {} — going "up" to zone list
    breadcrumbs.push({ label: zone.name, onClick: () => setPath({ zoneIdx }) });

    if (shelfIdx !== undefined && zone.shelves[shelfIdx]) {
      breadcrumbs.push({
        label: zone.shelves[shelfIdx],
        // ✅ FIX: going "up" to shelf list means keeping zoneIdx but dropping shelfIdx
        onClick: () => setPath({ zoneIdx }),
      });
    }
  }

  // ─── Render helpers ──────────────────────────────────────────────────────
  const renderZones = () => (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {inventoryLocations.length === 0 ? (
        <p className="text-sm text-muted-foreground col-span-full text-center py-8">
          No warehouse location data available.
          {" "}
          <span className="block text-xs mt-1 opacity-70">
            Zone/shelf/bin fields are not present on the current inventory endpoint.
          </span>
        </p>
      ) : (
        inventoryLocations.map((zone, i) => (
          <Card
            key={i}
            className="shadow-sm cursor-pointer hover:border-primary/40 transition-colors"
            onClick={() => setPath({ zoneIdx: i })}
          >
            <CardContent className="p-4">
              <p className="text-sm font-semibold">{zone.name}</p>
              <p className="text-xs text-muted-foreground mt-1">
                {zone.shelves.length} shelf{zone.shelves.length !== 1 ? "ves" : ""}
                {" · "}
                {zone.items.length} item{zone.items.length !== 1 ? "s" : ""}
              </p>
            </CardContent>
          </Card>
        ))
      )}
    </div>
  );

  const renderShelves = (zone) => (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {zone.shelves.length === 0 ? (
        <p className="text-sm text-muted-foreground col-span-full text-center py-8">
          No shelf data for this zone.
        </p>
      ) : (
        zone.shelves.map((shelf, i) => {
          const count = zone.items.filter((item) => item.shelf_name === shelf).length;
          return (
            <Card
              key={i}
              className="shadow-sm cursor-pointer hover:border-primary/40 transition-colors"
              onClick={() => setPath({ zoneIdx, shelfIdx: i })}
            >
              <CardContent className="p-4">
                <p className="text-sm font-semibold">{shelf}</p>
                <p className="text-xs text-muted-foreground mt-1">
                  {count} bin{count !== 1 ? "s" : ""}
                </p>
              </CardContent>
            </Card>
          );
        })
      )}
    </div>
  );

  const renderBins = (zone, shelfName) => {
    const items = zone.items.filter((item) => item.shelf_name === shelfName);
    return (
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {items.length === 0 ? (
          <p className="text-sm text-muted-foreground col-span-full text-center py-8">
            No bins on this shelf.
          </p>
        ) : (
          items.map((item, i) => (
            <Card key={i} className="shadow-sm">
              <CardContent className="p-4">
                <p className="text-sm font-medium">
                  {item.product?.product_name || item.product_name || "Empty"}
                </p>
                <p className="text-xs text-muted-foreground mt-1">
                  Bin: {item.bin_name || "-"} | Qty: {item.quantity ?? 0}
                </p>
                <div className="flex justify-end gap-1 mt-2">
                  <button className="p-1 rounded hover:bg-muted transition-colors">
                    <Pencil className="w-3 h-3 text-muted-foreground" />
                  </button>
                </div>
              </CardContent>
            </Card>
          ))
        )}
      </div>
    );
  };

  // ─── Choose what to render based on current path depth ──────────────────
  let content = null;

  if (isLoading) {
    content = (
      <div className="flex justify-center py-12">
        <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
      </div>
    );
  } else if (zoneIdx === undefined) {
    content = renderZones();
  } else {
    const zone = inventoryLocations[zoneIdx];
    if (!zone) {
      // Stale path — reset
      setPath({});
      content = null;
    } else if (shelfIdx === undefined) {
      content = renderShelves(zone);
    } else {
      const shelfName = zone.shelves[shelfIdx];
      content = shelfName ? renderBins(zone, shelfName) : null;
    }
  }

  return (
    <div className="space-y-4">
      {/* Breadcrumb nav + action button */}
      <div className="flex items-center justify-between">
        <nav className="flex items-center gap-1 text-sm">
          {breadcrumbs.map((bc, i) => (
            <span key={i} className="flex items-center gap-1">
              {i > 0 && <ChevronRight className="w-3.5 h-3.5 text-muted-foreground" />}
              <button
                onClick={bc.onClick}
                className={`hover:underline ${
                  i === breadcrumbs.length - 1
                    ? "font-medium text-foreground"
                    : "text-muted-foreground"
                }`}
              >
                {bc.label}
              </button>
            </span>
          ))}
        </nav>
        <Button size="sm" className="h-9" disabled>
          <Plus className="w-4 h-4 mr-1.5" /> Add (Coming Soon)
        </Button>
      </div>

      {/* Warehouse info banner */}
      {warehouse && zoneIdx === undefined && (
        <Card className="bg-muted/30">
          <CardContent className="p-4">
            <p className="text-sm font-medium">{warehouse.warehouse_name}</p>
            <p className="text-xs text-muted-foreground">{warehouse.address}</p>
          </CardContent>
        </Card>
      )}

      {content}
    </div>
  );
}