import { GoogleApiWrapper, Map as GeoMap, MapProps, Marker } from "google-maps-react";
import { observer } from "mobx-react";
import { Doc, Opt, DocListCast } from "../../../new_fields/Doc";
import { documentSchema } from "../../../new_fields/documentSchemas";
import { Id } from "../../../new_fields/FieldSymbols";
import { makeInterface } from "../../../new_fields/Schema";
import { Cast, NumCast, ScriptCast, StrCast } from "../../../new_fields/Types";
import "./CollectionMapView.scss";
import { CollectionSubView } from "./CollectionSubView";
import React = require("react");
import { DocumentManager } from "../../util/DocumentManager";
import { UndoManager, undoBatch } from "../../util/UndoManager";
import { IReactionDisposer, reaction, computed, runInAction } from "mobx";
import requestPromise = require("request-promise");

type MapSchema = makeInterface<[typeof documentSchema]>;
const MapSchema = makeInterface(documentSchema);

export type LocationData = google.maps.LatLngLiteral & {
    address?: string
    resolvedAddress?: string;
    zoom?: number;
};

// Nowhere, Oklahoma
const defaultLocation = { lat: 35.1592238, lng: -98.444512, zoom: 15 };

const query = async (data: string | google.maps.LatLngLiteral) => {
    const contents = typeof data === "string" ? `address=${data.replace(/\s+/g, "+")}` : `latlng=${data.lat},${data.lng}`;
    const target = `https://maps.googleapis.com/maps/api/geocode/json?${contents}&key=${process.env.GOOGLE_MAPS_GEO}`;
    return JSON.parse(await requestPromise.get(target));
};

@observer
class CollectionMapView extends CollectionSubView<MapSchema, Partial<MapProps> & { google: any }>(MapSchema) {

    private _cancelAddrReq = new Map<string, boolean>();
    private _cancelLocReq = new Map<string, boolean>();
    private addressUpdaters: IReactionDisposer[] = [];
    private latlngUpdaters: IReactionDisposer[] = [];

    /**
     * Note that all the uses of runInAction below are not included
     * as a way to update observables (documents handle this already
     * in their property setters), but rather to create a single bulk
     * update and thus prevent uneeded invocations of the location-
     * and address–updating reactions. 
     */

    getLocation = (doc: Opt<Doc>, fieldKey: string): Opt<LocationData> => {
        if (doc) {
            const lat: Opt<number> = Cast(doc[fieldKey + "-lat"], "number", null) || (Cast(doc[fieldKey + "-lat"], "string", null) && Number(Cast(doc[fieldKey + "-lat"], "string", null))) || undefined;
            const lng: Opt<number> = Cast(doc[fieldKey + "-lng"], "number", null) || (Cast(doc[fieldKey + "-lng"], "string", null) && Number(Cast(doc[fieldKey + "-lng"], "string", null))) || undefined;
            const zoom: Opt<number> = Cast(doc[fieldKey + "-zoom"], "number", null) || (Cast(doc[fieldKey + "-zoom"], "string", null) && Number(Cast(doc[fieldKey + "-zoom"], "string", null))) || undefined;
            const address: Opt<string> = Cast(doc[fieldKey + "-address"], "string", null);
            if (lat !== undefined && lng !== undefined) {
                return ({ lat, lng, zoom });
            } else if (address) {
                setTimeout(() => {
                    query(address).then(({ results }) => {
                        if (results?.length) {
                            const { lat, lng } = results[0].geometry.location;
                            if (doc[fieldKey + "-lat"] !== lat || doc[fieldKey + "-lng"] !== lng) {
                                runInAction(() => {
                                    Doc.SetInPlace(doc, fieldKey + "-lat", lat, true);
                                    Doc.SetInPlace(doc, fieldKey + "-lng", lng, true);
                                });
                            }
                        }
                    });
                });
                return defaultLocation;
            }
        }
        return undefined;
    }

    private markerClick = async (layout: Doc, { lat, lng, zoom }: LocationData) => {
        const batch = UndoManager.StartBatch("marker click");
        runInAction(() => {
            this.layoutDoc[this.props.fieldKey + "-mapCenter-lat"] = lat;
            this.layoutDoc[this.props.fieldKey + "-mapCenter-lng"] = lng;
            zoom && (this.layoutDoc[this.props.fieldKey + "-mapCenter-zoom"] = zoom);
        });
        if (layout.isLinkButton && DocListCast(layout.links).length) {
            await DocumentManager.Instance.FollowLink(undefined, layout, (doc: Doc, where: string, finished?: () => void) => {
                this.props.addDocTab(doc, where);
                finished?.();
            }, false, this.props.ContainingCollectionDoc, batch.end, undefined);
        } else {
            ScriptCast(layout.onClick)?.script.run({ this: layout, self: Cast(layout.rootDocument, Doc, null) || layout });
            batch.end();
        }
    }

    renderMarkerIcon(layout: Doc) {
        const iconUrl = StrCast(this.props.Document.mapIconUrl, null);
        if (iconUrl) {
            const iconWidth = NumCast(layout["mapLocation-iconWidth"], 45);
            const iconHeight = NumCast(layout["mapLocation-iconHeight"], 45);
            const iconSize = new google.maps.Size(iconWidth, iconHeight);
            return {
                size: iconSize,
                scaledSize: iconSize,
                url: iconUrl
            };
        }
    }

    renderMarker(layout: Doc) {
        const location = this.getLocation(layout, "mapLocation");
        return !location ? (null) :
            <Marker
                key={layout[Id]}
                label={StrCast(layout.title)}
                position={location}
                onClick={() => this.markerClick(layout, location)}
                icon={this.renderMarkerIcon(layout)}
            />;
    }

    @computed get contents() {
        this.addressUpdaters.forEach(disposer => disposer());
        this.addressUpdaters = [];
        this.latlngUpdaters.forEach(disposer => disposer());
        this.latlngUpdaters = [];
        return this.childLayoutPairs.map(({ layout }) => {
            this.addressUpdaters.push(reaction(
                () => ({ lat: layout["mapLocation-lat"], lng: layout["mapLocation-lng"] }),
                ({ lat, lng }) => {
                    if (this._cancelLocReq.get(layout[Id])) {
                        this._cancelLocReq.set(layout[Id], false);
                    } else if (lat !== undefined && lng !== undefined) {
                        query({ lat: NumCast(lat), lng: NumCast(lng) }).then(({ results }) => {
                            if (results?.length) {
                                const { formatted_address } = results[0];
                                if (formatted_address !== layout["mapLocation-address"]) {
                                    this._cancelAddrReq.set(layout[Id], true);
                                    Doc.SetInPlace(layout, "mapLocation-address", formatted_address, true);
                                }
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
                    } else if (address?.length) {
                        query(address).then(({ results }) => {
                            if (results?.length) {
                                const { geometry, formatted_address } = results[0];
                                const { lat, lng } = geometry.location;
                                runInAction(() => {
                                    if (layout["mapLocation-lat"] !== lat || layout["mapLocation-lng"] !== lng) {
                                        this._cancelLocReq.set(layout[Id], true);
                                        Doc.SetInPlace(layout, "mapLocation-lat", lat, true);
                                        Doc.SetInPlace(layout, "mapLocation-lng", lng, true);
                                    }
                                    if (formatted_address !== address) {
                                        this._cancelAddrReq.set(layout[Id], true);
                                        Doc.SetInPlace(layout, "mapLocation-address", formatted_address, true);
                                    }
                                });
                            }
                        });
                    }
                }
            ));
            return this.renderMarker(layout);
        });
    }

    render() {
        const { childLayoutPairs } = this;
        const { Document, fieldKey, active, google } = this.props;
        let center = this.getLocation(Document, fieldKey + "-mapCenter");
        if (center === undefined) {
            center = childLayoutPairs.map(pair => this.getLocation(pair.layout, "mapLocation")).find(layout => layout);
            if (center === undefined) {
                center = defaultLocation;
            }
        }
        return <div className="collectionMapView" ref={this.createDashEventsTarget}>
            <div className={"collectionMapView-contents"}
                style={{ pointerEvents: active() ? undefined : "none" }}
                onWheel={e => e.stopPropagation()}
                onPointerDown={e => (e.button === 0 && !e.ctrlKey) && e.stopPropagation()} >
                <GeoMap
                    google={google}
                    zoom={center.zoom || 10}
                    initialCenter={center}
                    center={center}
                    onDragend={undoBatch((_props: MapProps, map: google.maps.Map) => {
                        const { lat, lng } = map.getCenter();
                        runInAction(() => {
                            Document[fieldKey + "-mapCenter-lat"] = lat();
                            Document[fieldKey + "-mapCenter-lng"] = lng();
                        });
                    })}
                >
                    {this.contents}
                </GeoMap>
            </div>
        </div>;
    }

}

export default GoogleApiWrapper({
    apiKey: process.env.GOOGLE_MAPS!,
    LoadingContainer: () => (
        <div className={"loadingWrapper"}>
            <img className={"loadingGif"} src={"/assets/loading.gif"} />
        </div>
    )
})(CollectionMapView) as any;