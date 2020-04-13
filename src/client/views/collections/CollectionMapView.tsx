import { observer } from "mobx-react";
import { makeInterface } from "../../../new_fields/Schema";
import { documentSchema } from "../../../new_fields/documentSchemas";
import React = require("react");
import { Map, Marker, MapProps, GoogleApiWrapper } from "google-maps-react";
import { NumCast, StrCast } from "../../../new_fields/Types";
import { CollectionSubView } from "./CollectionSubView";
import { Utils } from "../../../Utils";

type MapDocument = makeInterface<[typeof documentSchema]>;
const MapDocument = makeInterface(documentSchema);

export type LocationData = google.maps.LatLngLiteral & { address?: string };

@observer
class CollectionMapView extends CollectionSubView<MapDocument, Partial<MapProps> & { google: any }>(MapDocument) {

    render() {
        const { childLayoutPairs, props } = this;
        const { Document } = props;
        const center: LocationData = { lat: NumCast(Document.mapCenterLat), lng: NumCast(Document.mapCenterLng) };
        if (!center.lat) {
            center.lat = childLayoutPairs.length ? NumCast(childLayoutPairs[0].layout.locationLat, 0) : 0;
            center.lng = childLayoutPairs.length ? NumCast(childLayoutPairs[0].layout.locationLng, 0) : 0;
        }
        return (
            <div
                className={"collectionMapView-contents"}
            >
                <Map
                    {...props}
                    zoom={NumCast(Document.zoom, 10)}
                    center={center}
                    initialCenter={center}
                >
                    {childLayoutPairs.map(({ layout }) => {
                        const location: LocationData = {
                            lat: NumCast(childLayoutPairs[0].layout.locationLat, 0),
                            lng: NumCast(childLayoutPairs[0].layout.locationLng, 0)
                        };
                        const iconSize = new google.maps.Size(NumCast(layout.mapIconWidth, 45), NumCast(layout.mapIconHeight, 45));

                        return (
                            <Marker
                                key={Utils.GenerateGuid()}
                                label={StrCast(layout.title)}
                                position={location}
                                onClick={() => {
                                    Document.mapCenterLat = location.lat;
                                    Document.mapCenterLng = location.lng;
                                }}
                                icon={{
                                    size: iconSize,
                                    scaledSize: iconSize,
                                    url: StrCast(Document.mapIconUrl, null)
                                }}
                            />
                        );
                    })}
                </Map>
            </div>
        );
    }

}

export default GoogleApiWrapper({ apiKey: process.env.GOOGLE_MAPS_API_KEY! })(CollectionMapView) as any;