import { observer } from "mobx-react";
import { makeInterface } from "../../../new_fields/Schema";
import { documentSchema } from "../../../new_fields/documentSchemas";
import React = require("react");
import { Map, Marker, MapProps, GoogleApiWrapper } from "google-maps-react";
import { NumCast, StrCast } from "../../../new_fields/Types";
import { CollectionSubView } from "./CollectionSubView";
import { Utils } from "../../../Utils";
import { Opt } from "../../../new_fields/Doc";
import "./CollectionMapView.scss";

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
            <div className={"collectionMapView-contents" + (this.props.active() ? "" : "-none")}
                onPointerDown={e => (this.props.active() && e.button === 0 && !e.ctrlKey) && e.stopPropagation()} >
                <Map
                    google={this.props.google}
                    zoom={NumCast(Document.zoom, 10)}
                    center={center}
                    initialCenter={center}
                >
                    {childLayoutPairs.map(({ layout }) => {
                        const location: LocationData = {
                            lat: NumCast(childLayoutPairs[0].layout.locationLat, 0),
                            lng: NumCast(childLayoutPairs[0].layout.locationLng, 0)
                        };
                        let icon: Opt<google.maps.Icon>, iconUrl: Opt<string>;
                        if ((iconUrl = StrCast(Document.mapIconUrl, null))) {
                            const iconSize = new google.maps.Size(NumCast(layout.mapIconWidth, 45), NumCast(layout.mapIconHeight, 45));
                            icon = {
                                size: iconSize,
                                scaledSize: iconSize,
                                url: iconUrl
                            };
                        }
                        return (
                            <Marker
                                key={Utils.GenerateGuid()}
                                label={StrCast(layout.title)}
                                position={location}
                                onClick={() => {
                                    Document.mapCenterLat = location.lat;
                                    Document.mapCenterLng = location.lng;
                                }}
                                icon={icon}
                            />
                        );
                    })}
                </Map>
            </div>
        );
    }

}

export default GoogleApiWrapper({ apiKey: process.env.GOOGLE_MAPS! })(CollectionMapView) as any;