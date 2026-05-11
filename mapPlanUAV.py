import sys
import json
import math
import os
from shapely.geometry import Point, shape, LineString, Polygon
from shapely.ops import unary_union

def plan_uav_path(start, goal, fixdatamap, airplanemap, output_file, max_distance_km):
    max_distance_m = max_distance_km * 1000
    
    # ===== 1. 載入固定禁飛區 =====
    try:
        with open(fixdatamap, 'r', encoding='utf-8') as f:
            fix_data = json.load(f)
    except:
        return None
    
    fixed_zones = []
    for feature in fix_data.get('features', []):
        try:
            geom = shape(feature['geometry'])
            fixed_zones.append(geom)
        except:
            pass
    
    fixed_obstacles = unary_union(fixed_zones) if fixed_zones else None
    
    # ===== 2. 載入飛機禁飛區 =====
    aircraft_zones = []
    try:
        with open(airplanemap, 'r', encoding='utf-8') as f:
            aircraft_data = json.load(f)
        
        for feature in aircraft_data.get('features', []):
            props = feature.get('properties', {})
            f_type = props.get('type', '')
            
            if f_type in ['aircraft_no_fly_zone', 'aircraft_predicted_no_fly_zone', 'aircraft_predicted_path_buffer']:
                try:
                    geom = shape(feature['geometry'])
                    aircraft_zones.append(geom)
                except:
                    pass
    except:
        pass
    
    # 合併所有障礙物
    all_obstacles = fixed_obstacles
    if aircraft_zones:
        aircraft_obstacles = unary_union(aircraft_zones)
        if all_obstacles:
            all_obstacles = all_obstacles.union(aircraft_obstacles)
        else:
            all_obstacles = aircraft_obstacles
    
    bounds = {"min_lng": 113.75, "max_lng": 114.50, "min_lat": 22.15, "max_lat": 22.60}
    
    def is_valid_point(lng, lat):
        point = Point(lng, lat)
        if all_obstacles and all_obstacles.contains(point):
            return False
        if not (bounds['min_lng'] <= lng <= bounds['max_lng'] and
                bounds['min_lat'] <= lat <= bounds['max_lat']):
            return False
        return True
    
    def line_intersects_obstacle(p1, p2):
        if not all_obstacles:
            return False
        try:
            line = LineString([p1, p2])
            return all_obstacles.intersects(line)
        except:
            return True
    
    if not is_valid_point(start[0], start[1]):
        return None
    
    if not is_valid_point(goal[0], goal[1]):
        return None
    
    # 計算兩點距離
    dx = (goal[1] - start[1]) * 111320 * math.cos(math.radians((start[0] + goal[0]) / 2))
    dy = (goal[0] - start[0]) * 111320
    direct_distance = math.sqrt(dx*dx + dy*dy)
    
    # 檢查直線是否可行
    if direct_distance <= max_distance_m and not line_intersects_obstacle(start, goal):
        path = [start, goal]
        coordinates = [[p[0], p[1]] for p in path]
        features = [
            {"type": "Feature", "properties": {"type": "uav_planned_path", "stroke": "#0066cc", "stroke-width": 3},
             "geometry": {"type": "LineString", "coordinates": coordinates}},
            {"type": "Feature", "properties": {"type": "start_point", "marker-color": "#00cc00", "marker-size": "large", "marker-symbol": "circle"},
             "geometry": {"type": "Point", "coordinates": [start[0], start[1]]}},
            {"type": "Feature", "properties": {"type": "goal_point", "marker-color": "#ff0000", "marker-size": "large", "marker-symbol": "circle"},
             "geometry": {"type": "Point", "coordinates": [goal[0], goal[1]]}}
        ]
        geojson = {"type": "FeatureCollection", "features": features}
        
        out_dir = os.path.dirname(output_file)
        if out_dir and not os.path.exists(out_dir):
            os.makedirs(out_dir)
        
        with open(output_file, 'w', encoding='utf-8') as f:
            json.dump(geojson, f, ensure_ascii=False, indent=2)
        return output_file
    
    # 嘗試搵 waypoint
    mid_lng = (start[0] + goal[0]) / 2
    mid_lat = (start[1] + goal[1]) / 2
    offsets = [0.001, 0.002, 0.003, 0.004, 0.005, 0.01, 0.015, 0.02]
    
    for offset in offsets:
        for dx, dy in [(offset, 0), (-offset, 0), (0, offset), (0, -offset),
                       (offset, offset), (offset, -offset), (-offset, offset), (-offset, -offset)]:
            waypoint = (mid_lng + dx, mid_lat + dy)
            
            if not is_valid_point(waypoint[0], waypoint[1]):
                continue
            
            if not line_intersects_obstacle(start, waypoint) and not line_intersects_obstacle(waypoint, goal):
                path = [start, waypoint, goal]
                
                total_dist = 0
                points = [start, waypoint, goal]
                for i in range(1, len(points)):
                    dx = (points[i][1] - points[i-1][1]) * 111320 * math.cos(math.radians((points[i][0] + points[i-1][0]) / 2))
                    dy = (points[i][0] - points[i-1][0]) * 111320
                    total_dist += math.sqrt(dx*dx + dy*dy)
                
                if total_dist <= max_distance_m:
                    coordinates = [[p[0], p[1]] for p in path]
                    features = [
                        {"type": "Feature", "properties": {"type": "uav_planned_path", "stroke": "#0066cc", "stroke-width": 3},
                         "geometry": {"type": "LineString", "coordinates": coordinates}},
                        {"type": "Feature", "properties": {"type": "start_point", "marker-color": "#00cc00", "marker-size": "large", "marker-symbol": "circle"},
                         "geometry": {"type": "Point", "coordinates": [start[0], start[1]]}},
                        {"type": "Feature", "properties": {"type": "goal_point", "marker-color": "#ff0000", "marker-size": "large", "marker-symbol": "circle"},
                         "geometry": {"type": "Point", "coordinates": [goal[0], goal[1]]}}
                    ]
                    geojson = {"type": "FeatureCollection", "features": features}
                    
                    out_dir = os.path.dirname(output_file)
                    if out_dir and not os.path.exists(out_dir):
                        os.makedirs(out_dir)
                    
                    with open(output_file, 'w', encoding='utf-8') as f:
                        json.dump(geojson, f, ensure_ascii=False, indent=2)
                    return output_file
    
    return None

if __name__ == "__main__":
    _script_dir = os.path.dirname(os.path.abspath(__file__))
    if len(sys.argv) >= 9:
        result = plan_uav_path(
            (float(sys.argv[1]), float(sys.argv[2])),
            (float(sys.argv[3]), float(sys.argv[4])),
            sys.argv[5],
            sys.argv[6],
            sys.argv[7],
            float(sys.argv[8])
        )
    else:
        _fix = os.path.join(_script_dir, "data", "fixed-zones.empty.geojson")
        _air = os.path.join(_script_dir, "data", "aircraft.empty.geojson")
        _out = os.path.join(_script_dir, "uav1_path.geojson")
        result = plan_uav_path(
            (114.26947779768864, 22.318652131053497),
            (114.17612038247337, 22.36972550862899),
            _fix,
            _air,
            _out,
            10
        )
    if result:
        print(result)
        sys.exit(0)
    else:
        print("No valid path found")
        sys.exit(1)