import { GoogleApiWrapper, Map as GeoMap, MapProps, Marker } from "google-maps-react";
import { observer } from "mobx-react";
import { Doc, Opt, DocListCast, FieldResult } from "../../../new_fields/Doc";
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
import { emptyFunction } from "../../../Utils";

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
    try {
        return JSON.parse(await requestPromise.get(target));
    } catch {
        return undefined;
    }
};

@observer
class CollectionMapView extends CollectionSubView<MapSchema, Partial<MapProps> & { google: any }>(MapSchema) {

    private _cancelAddrReq = new Map<string, boolean>();
    private _cancelLocReq = new Map<string, boolean>();
    private _initialLookupPending = new Map<string, boolean>();
    private addressUpdaters: IReactionDisposer[] = [];
    private latlngUpdaters: IReactionDisposer[] = [];

    /**
     * Note that all the uses of runInAction below are not included
     * as a way to update observables (documents handle this already
     * in their property setters), but rather to create a single bulk
     * update and thus prevent uneeded invocations of the location-
     * and address–updating reactions. 
     */

    private getLocation = (doc: Opt<Doc>, fieldKey: string): Opt<LocationData> => {
        if (doc) {
            const lat: Opt<number> = Cast(doc[fieldKey + "-lat"], "number", null) || (Cast(doc[fieldKey + "-lat"], "string", null) && Number(Cast(doc[fieldKey + "-lat"], "string", null))) || undefined;
            const lng: Opt<number> = Cast(doc[fieldKey + "-lng"], "number", null) || (Cast(doc[fieldKey + "-lng"], "string", null) && Number(Cast(doc[fieldKey + "-lng"], "string", null))) || undefined;
            const zoom: Opt<number> = Cast(doc[fieldKey + "-zoom"], "number", null) || (Cast(doc[fieldKey + "-zoom"], "string", null) && Number(Cast(doc[fieldKey + "-zoom"], "string", null))) || undefined;
            const address: Opt<string> = Cast(doc[fieldKey + "-address"], "string", null);
            if (lat !== undefined && lng !== undefined) {
                return ({ lat, lng, zoom });
            } else if (address) {
                const id = doc[Id];
                if (!this._initialLookupPending.get(id)) {
                    this._initialLookupPending.set(id, true);
                    setTimeout(() => {
                        this.respondToAddressChange(address, doc).then(() => this._initialLookupPending.delete(id));
                    });
                }
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

    private renderMarkerIcon = (layout: Doc) => {
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

    private renderMarker = (layout: Doc) => {
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

    private respondToAddressChange = async (newAddress: string, doc: Doc) => {
        const response = await query(newAddress);
        if (!response || response.status === "ZERO_RESULTS") {
            return false;
        }
        const { geometry, formatted_address } = response.results[0];
        const { lat, lng } = geometry.location;
        runInAction(() => {
            if (doc["mapLocation-lat"] !== lat || doc["mapLocation-lng"] !== lng) {
                this._cancelLocReq.set(doc[Id], true);
                Doc.SetInPlace(doc, "mapLocation-lat", lat, true);
                Doc.SetInPlace(doc, "mapLocation-lng", lng, true);
            }
            if (formatted_address !== newAddress) {
                this._cancelAddrReq.set(doc[Id], true);
                Doc.SetInPlace(doc, "mapLocation-address", formatted_address, true);
            }
        });
        return true;
    }

    private respondToLocationChange = async (newLat: FieldResult, newLng: FieldResult, doc: Doc) => {
        const response = await query({ lat: NumCast(newLat), lng: NumCast(newLng) });
        if (!response || response.status === "ZERO_RESULTS") {
            return false;
        }
        const { formatted_address } = response.results[0];
        if (formatted_address !== doc["mapLocation-address"]) {
            this._cancelAddrReq.set(doc[Id], true);
            Doc.SetInPlace(doc, "mapLocation-address", formatted_address, true);
        }
        return true;
    }

    @computed get contents() {
        this.addressUpdaters.forEach(disposer => disposer());
        this.addressUpdaters = [];
        this.latlngUpdaters.forEach(disposer => disposer());
        this.latlngUpdaters = [];
        return this.childLayoutPairs.map(({ layout }) => {
            const id = layout[Id];
            this.addressUpdaters.push(reaction(
                () => ({ lat: layout["mapLocation-lat"], lng: layout["mapLocation-lng"] }),
                emptyFunction,
                {
                    equals: (previous, { lat, lng }) => {
                        if (this._cancelLocReq.get(id)) {
                            this._cancelLocReq.set(id, false);
                        } else if (lat !== undefined && lng !== undefined) {
                            this.respondToLocationChange(lat, lng, layout).then(success => {
                                if (!success) {
                                    this._cancelLocReq.set(id, true);
                                    runInAction(() => {
                                        layout["mapLocation-lat"] = previous.lat;
                                        layout["mapLocation-lng"] = previous.lng;
                                    });
                                }
                            });
                        }
                        return previous === { lat, lng };
                    }
                }
            ));
            this.latlngUpdaters.push(reaction(
                () => Cast(layout["mapLocation-address"], "string", null),
                emptyFunction,
                {
                    equals: (previous, address) => {
                        if (this._cancelAddrReq.get(id)) {
                            this._cancelAddrReq.set(id, false);
                        } else if (address?.length) {
                            this.respondToAddressChange(address, layout).then(success => {
                                if (!success) {
                                    this._cancelAddrReq.set(id, true);
                                    layout["mapLocation-address"] = previous;
                                }
                            });
                        }
                        return previous === address;
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