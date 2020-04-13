import { GoogleApiWrapper, Map, MapProps, Marker } from "google-maps-react";
import { observer } from "mobx-react";
import { Doc, Opt, DocListCast } from "../../../new_fields/Doc";
import { documentSchema } from "../../../new_fields/documentSchemas";
import { Id } from "../../../new_fields/FieldSymbols";
import { makeInterface } from "../../../new_fields/Schema";
import { Cast, NumCast, ScriptCast, StrCast } from "../../../new_fields/Types";
import { TraceMobx } from "../../../new_fields/util";
import "./CollectionMapView.scss";
import { CollectionSubView } from "./CollectionSubView";
import React = require("react");
import { DocumentManager } from "../../util/DocumentManager";
import { UndoManager } from "../../util/UndoManager";
import { returnTrue } from "../../../Utils";
import { CancellationError } from "bluebird";
import { ln } from "shelljs";
import { dfareporting } from "googleapis/build/src/apis/dfareporting";

type MapDocument = makeInterface<[typeof documentSchema]>;
const MapDocument = makeInterface(documentSchema);

export type LocationData = google.maps.LatLngLiteral & { address?: string };

@observer
class CollectionMapView extends CollectionSubView<MapDocument, Partial<MapProps> & { google: any }>(MapDocument) {

    getLocation = (doc: Opt<Doc>, fieldKey: string, defaultLocation?: LocationData) => {
        if (doc) {
            let lat: Opt<number> = Cast(doc[fieldKey + "-lat"], "number", null);
            let lng: Opt<number> = Cast(doc[fieldKey + "-lng"], "number", null);
            const address = Cast(doc[fieldKey + "-address"], "string", null);
            if (address) {
                // use geo service to convert to lat/lng
                lat = lat;
                lng = lng;
            }
            if (lat === undefined) lat = defaultLocation?.lat;
            if (lng === undefined) lng = defaultLocation?.lng;
            return ({ lat, lng });
        }
        return ({ lat: 35.1592238, lng: -98.4466577 });
    }
    renderMarker(layout: Doc, icon: Opt<google.maps.Icon>) {
        const location = this.getLocation(layout, "location");
        return location.lat === undefined || location.lng === undefined ? (null) :
            <Marker
                key={layout[Id]}
                label={StrCast(layout.title)}
                position={{ lat: location.lat, lng: location.lng }}
                onClick={async () => {
                    this.props.Document.mapCenterLat = location.lat;
                    this.props.Document.mapCenterLng = location.lng;
                    if (layout.isLinkButton && DocListCast(layout.links).length) {
                        const batch = UndoManager.StartBatch("follow link click");
                        await DocumentManager.Instance.FollowLink(undefined, layout, (doc: Doc, where: string, finished?: () => void) => {
                            this.props.addDocTab(doc, where);
                            finished?.();
                        }, false, this.props.ContainingCollectionDoc, batch.end, undefined);
                    } else {
                        ScriptCast(layout.onClick)?.script.run({ this: layout, self: Cast(layout.rootDocument, Doc, null) || layout });
                    }
                }}
                icon={icon}
            />;
    }
    render() {
        const { childLayoutPairs } = this;
        const { Document } = this.props;
        let center = this.getLocation(Document, this.props.fieldKey + "-mapCenter");
        if (center.lat === undefined) {
            center = this.getLocation(childLayoutPairs.map(pair => pair.layout).find(returnTrue), "location", { lat: 35.1592238, lng: -98.4466577 });
        }
        TraceMobx();
        return center.lat === undefined || center.lng === undefined ? (null) :
            <div className={"collectionMapView-contents"}
                style={{ pointerEvents: this.props.active() ? undefined : "none" }}
                onWheel={e => e.stopPropagation()}
                onPointerDown={e => (e.button === 0 && !e.ctrlKey) && e.stopPropagation()} >
                <Map
                    google={this.props.google}
                    zoom={NumCast(Document.zoom, 10)}
                    center={{ lat: center.lat, lng: center.lng }}
                    initialCenter={{ lat: center.lat, lng: center.lng }}
                >
                    {childLayoutPairs.map(({ layout }) => {
                        let icon: Opt<google.maps.Icon>, iconUrl: Opt<string>;
                        if ((iconUrl = StrCast(Document.mapIconUrl, null))) {
                            const iconSize = new google.maps.Size(NumCast(layout.mapIconWidth, 45), NumCast(layout.mapIconHeight, 45));
                            icon = {
                                size: iconSize,
                                scaledSize: iconSize,
                                url: iconUrl
                            };
                        }
                        return this.renderMarker(layout, icon);
                    })}
                </Map>
            </div>;
    }

}

export default GoogleApiWrapper({ apiKey: process.env.GOOGLE_MAPS! })(CollectionMapView) as any;