import { GoogleApiWrapper, Map as GeoMap, MapProps, Marker } from "google-maps-react";
import { observer } from "mobx-react";
import { Doc, Opt, DocListCast } from "../../../new_fields/Doc";
import { documentSchema } from "../../../new_fields/documentSchemas";
import { Id } from "../../../new_fields/FieldSymbols";
import { makeInterface } from "../../../new_fields/Schema";
import { Cast, NumCast, ScriptCast, StrCast, BoolCast } from "../../../new_fields/Types";
import { TraceMobx } from "../../../new_fields/util";
import "./CollectionMapView.scss";
import { CollectionSubView } from "./CollectionSubView";
import React = require("react");
import { DocumentManager } from "../../util/DocumentManager";
import { UndoManager } from "../../util/UndoManager";
import { IReactionDisposer, reaction, action } from "mobx";
import requestPromise = require("request-promise");

type MapSchema = makeInterface<[typeof documentSchema]>;
const MapSchema = makeInterface(documentSchema);

export type LocationData = google.maps.LatLngLiteral & {
    address?: string
    resolvedAddress?: string;
    zoom?: number;
};

const base = "https://maps.googleapis.com/maps/api/geocode/json?";

@observer
class CollectionMapView extends CollectionSubView<MapSchema, Partial<MapProps> & { google: any }>(MapSchema) {

    private mapRef = React.createRef<GeoMap>();
    private addressUpdaters: IReactionDisposer[] = [];
    private latlngUpdaters: IReactionDisposer[] = [];

    getLocation = (doc: Opt<Doc>, fieldKey: string): Opt<LocationData> => {
        if (doc) {
            const lat: Opt<number> = Cast(doc[fieldKey + "-lat"], "number", null);
            const lng: Opt<number> = Cast(doc[fieldKey + "-lng"], "number", null);
            const zoom: Opt<number> = Cast(doc[fieldKey + "-zoom"], "number", null);
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
                    this.map.panTo(location);
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

    _cancelAddrReq = new Map<string, boolean>();
    _cancelLocReq = new Map<string, boolean>();
    private get contents() {
        this.addressUpdaters.forEach(disposer => disposer());
        this.addressUpdaters = [];
        this.latlngUpdaters.forEach(disposer => disposer());
        this.latlngUpdaters = [];
        return this.childLayoutPairs.map(({ layout, data }) => {
            let icon: Opt<google.maps.Icon>, iconUrl: Opt<string>;
            if ((iconUrl = StrCast(this.props.Document.mapIconUrl, null))) {
                const iconWidth = NumCast(layout["mapLocation-iconWidth"], 45);
                const iconHeight = NumCast(layout["mapLocation-iconHeight"], 45);
                const iconSize = new google.maps.Size(iconWidth, iconHeight);
                icon = {
                    size: iconSize,
                    scaledSize: iconSize,
                    url: iconUrl
                };
            }
            this.addressUpdaters.push(reaction(
                () => ({
                    lat: NumCast(layout["mapLocation-lat"]),
                    lng: NumCast(layout["mapLocation-lng"])
                }),
                ({ lat, lng }) => {
                    if (this._cancelLocReq.get(layout[Id])) {
                        this._cancelLocReq.set(layout[Id], false);
                    }
                    else if (lat !== undefined && lng !== undefined) {
                        const target = `${base}latlng=${lat},${lng}&key=${process.env.GOOGLE_MAPS_GEO!}`;
                        requestPromise.get(target).then(res => {
                            const formatted_address = JSON.parse(res).results[0].formatted_address || "<invalid address>";
                            if (formatted_address !== layout["mapLocation-address"]) {
                                this._cancelAddrReq.set(layout[Id], true);
                                Doc.SetInPlace(layout, "mapLocation-address", formatted_address, true);
                            }
                        });
                    }
                }
            ));
            this.latlngUpdaters.push(reaction(
                () => ({ address: Cast(layout["mapLocation-address"], "string", null) }),
                ({ address }) => {
                    if (this._cancelAddrReq.get(layout[Id])) {
                        this._cancelAddrReq.set(layout[Id], false);
                    }
                    else if (address?.length) {
                        const target = `${base}address=${address.replace(/\s+/g, "+")}&key=${process.env.GOOGLE_MAPS_GEO!}`;
                        requestPromise.get(target).then(action((res: any) => {
                            const { geometry, formatted_address } = JSON.parse(res).results[0];
                            const { lat, lng } = geometry.location;
                            if (layout["mapLocation-lat"] !== lat || layout["mapLocation-lng"] !== lng) {
                                this._cancelLocReq.set(layout[Id], true);
                                Doc.SetInPlace(layout, "mapLocation-lat", lat, true);
                                Doc.SetInPlace(layout, "mapLocation-lng", lng, true);
                            }
                            if (formatted_address !== address) {
                                this._cancelAddrReq.set(layout[Id], true);
                                Doc.SetInPlace(layout, "mapLocation-address", formatted_address, true);
                            }
                        }));
                    }
                }
            ));
            return this.renderMarker(layout, icon);
        });
    }

    private get map() {
        return (this.mapRef.current as any).map;
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
            <GeoMap
                ref={this.mapRef}
                google={this.props.google}
                zoom={center.zoom || 10}
                initialCenter={center}
                center={center}
                onDragend={() => {
                    const { center } = this.map;
                    Document[this.props.fieldKey + "-mapCenter-lat"] = center.lat();
                    Document[this.props.fieldKey + "-mapCenter-lng"] = center.lng();
                }}
            >
                {this.contents}
            </GeoMap>
        </div>;
    }

}

const LoadingContainer = () => {
    return <div className={"loadingWrapper"}><img className={"loadingGif"} src={"/assets/loading.gif"} /></div>;
};

export default GoogleApiWrapper({ apiKey: process.env.GOOGLE_MAPS!, LoadingContainer })(CollectionMapView) as any;