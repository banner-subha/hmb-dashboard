// Douglas-Peucker polygon simplification — shared between the app
// (GeoIntelligence.jsx) and the build-time pre-simplification script
// (scripts/pre-simplify-geo.mjs). Do NOT fork this logic.

function getSqSegDist(p, p1, p2) {
  let x = p1[0], y = p1[1];
  let dx = p2[0] - x, dy = p2[1] - y;
  if (dx !== 0 || dy !== 0) {
    let t = ((p[0] - x) * dx + (p[1] - y) * dy) / (dx * dx + dy * dy);
    if (t > 1) {
      x = p2[0];
      y = p2[1];
    } else if (t > 0) {
      x += dx * t;
      y += dy * t;
    }
  }
  dx = p[0] - x;
  dy = p[1] - y;
  return dx * dx + dy * dy;
}

function simplifyPath(points, tolerance) {
  if (points.length <= 2) return points;
  let maxSqDist = 0;
  let index = 0;
  const end = points.length - 1;
  for (let i = 1; i < end; i++) {
    const sqDist = getSqSegDist(points[i], points[0], points[end]);
    if (sqDist > maxSqDist) {
      index = i;
      maxSqDist = sqDist;
    }
  }
  if (maxSqDist > tolerance * tolerance) {
    const results1 = simplifyPath(points.slice(0, index + 1), tolerance);
    const results2 = simplifyPath(points.slice(index), tolerance);
    return results1.slice(0, results1.length - 1).concat(results2);
  }
  return [points[0], points[end]];
}

function simplifyGeometry(geom, tolerance = 0.01) {
  if (!geom) return null;
  if (geom.type === 'Polygon') {
    return {
      ...geom,
      coordinates: geom.coordinates.map(ring => simplifyPath(ring, tolerance))
    };
  }
  if (geom.type === 'MultiPolygon') {
    return {
      ...geom,
      coordinates: geom.coordinates.map(polygon =>
        polygon.map(ring => simplifyPath(ring, tolerance))
      )
    };
  }
  return geom;
}

function simplifyFeatureCollection(features, tolerance = 0.01) {
  return features.map(f => ({
    ...f,
    geometry: simplifyGeometry(f.geometry, tolerance)
  }));
}

export { getSqSegDist, simplifyPath, simplifyGeometry, simplifyFeatureCollection };
