import React from "react";
import { useParams } from "react-router-dom";
import MuMap from "../MuMap.jsx";

export default function MapPage() {
  const { mapId } = useParams();
  return <MuMap mapId={mapId} />;
}
