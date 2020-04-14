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
import * as ReactDOM from 'react-dom';

type MapSchema = makeInterface<[typeof documentSchema]>;
const MapSchema = makeInterface(documentSchema);

export type LocationData = google.maps.LatLngLiteral & { address?: string };

@observer
class CollectionMapView extends CollectionSubView<MapSchema, Partial<MapProps> & { google: any }>(MapSchema) {

    getLocation = (doc: Opt<Doc>, fieldKey: string) => {
        if (doc) {
            let lat: Opt<number> = Cast(doc[fieldKey + "-lat"], "number", null);
            let lng: Opt<number> = Cast(doc[fieldKey + "-lng"], "number", null);
            const zoom: Opt<number> = Cast(doc[fieldKey + "-zoom"], "number", null);
            const address = Cast(doc[fieldKey + "-address"], "string", null);
            if (address) {
                // use geo service to convert to lat/lng
                lat = lat;
                lng = lng;
            }
            return lat !== undefined && lng !== undefined ? ({ lat, lng, zoom }) : undefined;
        }
        return undefined;
    }
    renderMarker(layout: Doc, icon: Opt<google.maps.Icon>) {
        const location = this.getLocation(layout, "mapLocation");
        return !location ? (null) :
            <Marker
                key={layout[Id]}
                label={StrCast(layout.title)}
                position={{ lat: location.lat, lng: location.lng }}
                onClick={async () => {
                    this.layoutDoc[this.props.fieldKey + "-mapCenter-lat"] = 0;
                    this.layoutDoc[this.props.fieldKey + "-mapCenter-lat"] = location.lat;
                    this.layoutDoc[this.props.fieldKey + "-mapCenter-lng"] = location.lng;
                    location.zoom && (this.layoutDoc[this.props.fieldKey + "-mapCenter-zoom"] = location.zoom);
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
        if (center === undefined) {
            center = childLayoutPairs.map(pair => this.getLocation(pair.layout, "mapLocation")).find(layout => layout);
            if (center === undefined) {
                center = { lat: 35.1592238, lng: -98.444512, zoom: 15 }; // nowhere, OK
            }
        }
        TraceMobx();
        return <div className={"collectionMapView-contents"}
            style={{ pointerEvents: this.props.active() ? undefined : "none" }}
            onWheel={e => e.stopPropagation()}
            onPointerDown={e => (e.button === 0 && !e.ctrlKey) && e.stopPropagation()} >
            <Map
                google={this.props.google}
                zoom={center.zoom || 10}
                initialCenter={center}
                onBoundsChanged={(props, map, e) => console.log("ON_BOUNDS_CHANGED", props, map, e)}
                onRecenter={(props, map, e) => console.log("ON_RECENTER", props, map, e)}
                onDragend={(centerMoved, center) => console.log("ON_DRAGEND", centerMoved, center)}
                onProjectionChanged={(props, map, e) => console.log("ON_PROJ_CHANGED", props, map, e)}
                onCenterChanged={((props, map, e) => {
                    console.log("ON_CENTER_CHANGED", props, map, e);
                    Document[this.props.fieldKey + "-mapCenter-lat"] = typeof e?.center?.lat === "number" ? e.center.lat : center!.lat;
                    Document[this.props.fieldKey + "-mapCenter-lng"] = typeof e?.center?.lng === "number" ? e.center.lng : center!.lng;
                })}
            >
                {childLayoutPairs.map(({ layout }) => {
                    let icon: Opt<google.maps.Icon>, iconUrl: Opt<string>;
                    if ((iconUrl = StrCast(Document.mapIconUrl, null))) {
                        const iconWidth = NumCast(layout["mapLocation-iconWidth"], 45);
                        const iconHeight = NumCast(layout["mapLocation-iconHeight"], 45);
                        const iconSize = new google.maps.Size(iconWidth, iconHeight);
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

const LoadingContainer = () => {
    return <div className={"loadingWrapper"}><img className={"loadingGif"} src={"/assets/loading.gif"} /></div>;
};

export default GoogleApiWrapper({ apiKey: process.env.GOOGLE_MAPS!, LoadingContainer })(CollectionMapView) as any;