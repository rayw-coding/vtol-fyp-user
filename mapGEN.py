import sys
import requests
import json
import math
from datetime import datetime, timedelta
import os
from shapely.geometry import Point, Polygon, LineString, mapping

def getAirplane(input_geojson, output_geojson):
    if input_geojson is None or output_geojson is None:
        return None
    
    api_url = "https://opensky-network.org/api/states/all"
    hk_bounds = {"min_lng": 113.75, "max_lng": 114.50, "min_lat": 22.15, "max_lat": 22.60}
    
    def is_in_hk(lng, lat):
        return (hk_bounds['min_lng'] <= lng <= hk_bounds['max_lng'] and
                hk_bounds['min_lat'] <= lat <= hk_bounds['max_lat'])
    
    # 只讀取機場範圍用嚟過濾，唔會輸出
    airport_polygons = []
    try:
        with open(input_geojson, 'r', encoding='utf-8') as f:
            map_data = json.load(f)
        for feature in map_data['features']:
            name = feature['properties'].get('name', '')
            if name == '香港國際機場':
                coords = feature['geometry']['coordinates'][0]
                airport_polygons.append(Polygon([[c[0], c[1]] for c in coords]))
    except:
        pass
    
    def is_in_airport(lng, lat):
        if not airport_polygons:
            return False
        point = Point(lng, lat)
        for poly in airport_polygons:
            if poly.contains(point):
                return True
        return False
    
    def predict_future_position(lng, lat, velocity, heading, seconds):
        if velocity is None or heading is None or velocity <= 0:
            return None
        distance = velocity * seconds
        lat_change = distance / 111320
        lng_change = distance / (111320 * math.cos(math.radians(lat)))
        rad = math.radians(heading)
        delta_lat = lat_change * math.cos(rad)
        delta_lng = lng_change * math.sin(rad)
        return [lng + delta_lng, lat + delta_lat]
    
    def create_buffer_polygon(coords, buffer_meters=2000):
        if len(coords) < 2:
            return None
        try:
            line = LineString(coords)
            buffer_degrees = buffer_meters / 111320
            buffered = line.buffer(buffer_degrees)
            return buffered
        except:
            return None
    
    try:
        resp = requests.get(api_url, timeout=10)
        if resp.status_code != 200:
            return None
        data = resp.json()
    except:
        return None
    
    aircraft_list = []
    
    for state in data['states']:
        if state[5] and state[6]:
            lng, lat = state[5], state[6]
            if is_in_hk(lng, lat):
                
                # 過濾機場內飛機
                if is_in_airport(lng, lat):
                    continue
                
                velocity = state[9]
                heading = state[10]
                altitude = state[7]
                state_time = datetime.fromtimestamp(state[4])
                
                pred_points = []
                last_valid_position = [lng, lat]
                
                for sec in range(30, 1801, 30):
                    pred = predict_future_position(lng, lat, velocity, heading, sec)
                    if pred and is_in_hk(pred[0], pred[1]):
                        pred_time = state_time + timedelta(seconds=sec)
                        pred_points.append({
                            'seconds': sec,
                            'minutes': round(sec / 60, 1),
                            'time': pred_time.isoformat(),
                            'position': pred,
                            'altitude': altitude
                        })
                        last_valid_position = pred
                    else:
                        break
                
                if pred_points:
                    aircraft_list.append({
                        'callsign': state[1].strip() if state[1] else 'Unknown',
                        'lng': lng, 'lat': lat,
                        'altitude': altitude, 'velocity': velocity, 'heading': heading,
                        'time': state_time.isoformat(),
                        'pred_points': pred_points,
                        'last_position': last_valid_position
                    })
    
    if not aircraft_list:
        return None
    
    def circle_to_polygon(cx, cy, radius=2000, points=36):
        coords = []
        lat_rad = math.radians(cy)
        lat_off = radius / 111320
        lng_off = radius / (111320 * math.cos(lat_rad))
        for i in range(points):
            angle = (2 * math.pi * i) / points
            coords.append([cx + math.cos(angle) * lng_off, cy + math.sin(angle) * lat_off])
        coords.append(coords[0])
        return coords
    
    # 只輸出飛機相關 features，唔輸出固定禁飛區
    features = []
    
    CURRENT_COLOR = "#0066cc"
    CURRENT_FILL = "#0066cc"
    PREDICT_COLOR = "#ff6600"
    PREDICT_FILL = "#ff6600"
    
    for ac in aircraft_list:
        features.append({
            "type": "Feature",
            "properties": {
                "type": "aircraft_position",
                "callsign": ac['callsign'],
                "altitude": ac['altitude'],
                "velocity": ac['velocity'],
                "heading": ac['heading'],
                "time": ac['time'],
                "color": CURRENT_COLOR,
                "marker-color": CURRENT_COLOR
            },
            "geometry": {"type": "Point", "coordinates": [ac['lng'], ac['lat']]}
        })
        
        features.append({
            "type": "Feature",
            "properties": {
                "type": "aircraft_no_fly_zone",
                "callsign": ac['callsign'],
                "radius_meters": 2000,
                "altitude": ac['altitude'],
                "time": ac['time'],
                "fill": CURRENT_FILL,
                "fill-opacity": 0.15,
                "stroke": CURRENT_COLOR,
                "stroke-opacity": 0.5
            },
            "geometry": {"type": "Polygon", "coordinates": [circle_to_polygon(ac['lng'], ac['lat'])]}
        })
        
        path_coords = [[ac['lng'], ac['lat']]]
        for pred in ac['pred_points']:
            if pred['position']:
                path_coords.append(pred['position'])
        
        if len(path_coords) >= 2:
            features.append({
                "type": "Feature",
                "properties": {
                    "type": "aircraft_predicted_path_centerline",
                    "callsign": ac['callsign'],
                    "prediction_seconds": ac['pred_points'][-1]['seconds'] if ac['pred_points'] else 0,
                    "prediction_minutes": ac['pred_points'][-1]['minutes'] if ac['pred_points'] else 0,
                    "velocity": ac['velocity'],
                    "heading": ac['heading'],
                    "start_time": ac['time'],
                    "end_time": ac['pred_points'][-1]['time'] if ac['pred_points'] else ac['time'],
                    "color": PREDICT_COLOR,
                    "stroke": PREDICT_COLOR
                },
                "geometry": {"type": "LineString", "coordinates": path_coords}
            })
            
            buffer_polygon = create_buffer_polygon(path_coords, 2000)
            if buffer_polygon:
                features.append({
                    "type": "Feature",
                    "properties": {
                        "type": "aircraft_predicted_path_buffer",
                        "callsign": ac['callsign'],
                        "width_meters": 2000,
                        "prediction_seconds": ac['pred_points'][-1]['seconds'] if ac['pred_points'] else 0,
                        "prediction_minutes": ac['pred_points'][-1]['minutes'] if ac['pred_points'] else 0,
                        "velocity": ac['velocity'],
                        "heading": ac['heading'],
                        "start_time": ac['time'],
                        "end_time": ac['pred_points'][-1]['time'] if ac['pred_points'] else ac['time'],
                        "fill": PREDICT_FILL,
                        "fill-opacity": 0.1,
                        "stroke": PREDICT_COLOR,
                        "stroke-opacity": 0.4
                    },
                    "geometry": mapping(buffer_polygon)
                })
        
        for pred in ac['pred_points']:
            if pred['position']:
                features.append({
                    "type": "Feature",
                    "properties": {
                        "type": "aircraft_predicted_position",
                        "callsign": ac['callsign'],
                        "seconds": pred['seconds'],
                        "minutes": pred['minutes'],
                        "time": pred['time'],
                        "altitude": pred['altitude'],
                        "velocity": ac['velocity'],
                        "heading": ac['heading'],
                        "color": PREDICT_COLOR,
                        "marker-color": PREDICT_COLOR
                    },
                    "geometry": {"type": "Point", "coordinates": pred['position']}
                })
                
                features.append({
                    "type": "Feature",
                    "properties": {
                        "type": "aircraft_predicted_no_fly_zone",
                        "callsign": ac['callsign'],
                        "seconds": pred['seconds'],
                        "minutes": pred['minutes'],
                        "time": pred['time'],
                        "radius_meters": 2000,
                        "altitude": pred['altitude'],
                        "fill": PREDICT_FILL,
                        "fill-opacity": 0.1,
                        "stroke": PREDICT_COLOR,
                        "stroke-opacity": 0.3
                    },
                    "geometry": {"type": "Polygon", "coordinates": [circle_to_polygon(pred['position'][0], pred['position'][1])]}
                })
    
    out_dir = os.path.dirname(output_geojson)
    if out_dir and not os.path.exists(out_dir):
        os.makedirs(out_dir)
    
    with open(output_geojson, 'w', encoding='utf-8') as f:
        json.dump({
            "type": "FeatureCollection",
            "features": features
        }, f, ensure_ascii=False, indent=2)
        
    return output_geojson


if __name__ == "__main__":
    if len(sys.argv) >= 3:
        getAirplane(sys.argv[1], sys.argv[2])
    else:
        getAirplane('mapNew.geojson', 'PlaneDataMap/my_aircraft_data.geojson')