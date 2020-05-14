import { GoogleApiWrapper, Map as GeoMap, IMapProps, Marker } from "google-maps-react";
import { observer } from "mobx-react";
import { Doc, Opt, DocListCast, FieldResult, Field } from "../../../new_fields/Doc";
import { documentSchema } from "../../../new_fields/documentSchemas";
import { Id } from "../../../new_fields/FieldSymbols";
import { makeInterface } from "../../../new_fields/Schema";
import { Cast, NumCast, ScriptCast, StrCast } from "../../../new_fields/Types";
import "./CollectionMapView.scss";
import { CollectionSubView } from "./CollectionSubView";
import React = require("react");
import { DocumentManager } from "../../util/DocumentManager";
import { UndoManager, undoBatch } from "../../util/UndoManager";
import { computed, runInAction, Lambda, action } from "mobx";
import requestPromise = require("request-promise");

type MapSchema = makeInterface<[typeof documentSchema]>;
const MapSchema = makeInterface(documentSchema);

export type LocationData = google.maps.LatLngLiteral & {
    address?: string
    resolvedAddress?: string;
    zoom?: number;
};

interface DocLatLng {
    lat: FieldResult<Field>;
    lng: FieldResult<Field>;
}

// Nowhere, Oklahoma
const defaultLocation = { lat: 35.1592238, lng: -98.444512, zoom: 15 };
const noResults = "ZERO_RESULTS";

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
class CollectionMapView extends CollectionSubView<MapSchema, Partial<IMapProps> & { google: any }>(MapSchema) {

    private _cancelAddrReq = new Map<string, boolean>();
    private _cancelLocReq = new Map<string, boolean>();
    private _initialLookupPending = new Map<string, boolean>();
    private responders: { location: Lambda, address: Lambda }[] = [];

    /**
     * Note that all the uses of runInAction below are not included
     * as a way to update observables (documents handle this already
     * in their property setters), but rather to create a single bulk
     * update and thus prevent uneeded invocations of the location-
     * and address–updating reactions. 
     */

    private getLocation = (doc: Opt<Doc>, fieldKey: string, returnDefault: boolean = true): Opt<LocationData> => {
        if (doc) {
            const titleLoc = StrCast(doc.title).startsWith("@") ? StrCast(doc.title).substring(1) : undefined;
            const lat = Cast(doc[`${fieldKey}-lat`], "number", null) || (Cast(doc[`${fieldKey}-lat`], "string", null) && Number(Cast(doc[`${fieldKey}-lat`], "string", null))) || undefined;
            const lng = Cast(doc[`${fieldKey}-lng`], "number", null) || (Cast(doc[`${fieldKey}-lng`], "string", null) && Number(Cast(doc[`${fieldKey}-lng`], "string", null))) || undefined;
            const zoom = Cast(doc[`${fieldKey}-zoom`], "number", null) || (Cast(doc[`${fieldKey}-zoom`], "string", null) && Number(Cast(doc[`${fieldKey}-zoom`], "string", null))) || undefined;
            const address = titleLoc || StrCast(doc[`${fieldKey}-address`], StrCast(doc.title).replace(/^-/, ""));
            if (titleLoc || (address && (lat === undefined || lng === undefined))) {
                const id = doc[Id];
                if (!this._initialLookupPending.get(id)) {
                    this._initialLookupPending.set(id, true);
                    setTimeout(() => {
                        titleLoc && Doc.SetInPlace(doc, "title", titleLoc, true);
                        this.respondToAddressChange(doc, fieldKey, address).then(() => this._initialLookupPending.delete(id));
                    });
                }
            }
            return (lat === undefined || lng === undefined) ? (returnDefault ? defaultLocation : undefined) : { lat, lng, zoom };
        }
        return undefined;
    }

    private markerClick = async (layout: Doc, { lat, lng, zoom }: LocationData) => {
        const batch = UndoManager.StartBatch("marker click");
        const { fieldKey } = this.props;
        runInAction(() => {
            this.layoutDoc[`${fieldKey}-mapCenter-lat`] = lat;
            this.layoutDoc[`${fieldKey}-mapCenter-lng`] = lng;
            zoom && (this.layoutDoc[`${fieldKey}-mapCenter-zoom`] = zoom);
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
        const { Document } = this.props;
        const fieldKey = Doc.LayoutFieldKey(layout);
        const iconUrl = StrCast(layout.mapIconUrl, StrCast(Document.mapIconUrl));
        if (iconUrl) {
            const iconWidth = NumCast(layout[`${fieldKey}-iconWidth`], 45);
            const iconHeight = NumCast(layout[`${fieldKey}-iconHeight`], 45);
            const iconSize = new google.maps.Size(iconWidth, iconHeight);
            return {
                size: iconSize,
                scaledSize: iconSize,
                url: iconUrl
            };
        }
    }

    private renderMarker = (layout: Doc) => {
        const location = this.getLocation(layout, Doc.LayoutFieldKey(layout));
        return !location ? (null) :
            <Marker
                key={layout[Id]}
                label={StrCast(layout.title)}
                position={location}
                onClick={() => this.markerClick(layout, location)}
                icon={this.renderMarkerIcon(layout)}
            />;
    }

    private respondToAddressChange = async (doc: Doc, fieldKey: string, newAddress: string, oldAddress?: string) => {
        if (newAddress === oldAddress) {
            return false;
        }
        const response = await query(newAddress);
        const id = doc[Id];
        if (!response || response.status === noResults) {
            this._cancelAddrReq.set(id, true);
            doc[`${fieldKey}-address`] = oldAddress;
            return false;
        }
        const { geometry, formatted_address } = response.results[0];
        const { lat, lng } = geometry.location;
        runInAction(() => {
            if (doc[`${fieldKey}-lat`] !== lat || doc[`${fieldKey}-lng`] !== lng) {
                this._cancelLocReq.set(id, true);
                Doc.SetInPlace(doc, `${fieldKey}-lat`, lat, true);
                Doc.SetInPlace(doc, `${fieldKey}-lng`, lng, true);
            }
            if (formatted_address !== newAddress) {
                this._cancelAddrReq.set(id, true);
                Doc.SetInPlace(doc, `${fieldKey}-address`, formatted_address, true);
            }
        });
        return true;
    }

    private respondToLocationChange = async (doc: Doc, fieldKey: string, newLatLng: DocLatLng, oldLatLng: Opt<DocLatLng>) => {
        if (newLatLng === oldLatLng) {
            return false;
        }
        const response = await query({ lat: NumCast(newLatLng.lat), lng: NumCast(newLatLng.lng) });
        const id = doc[Id];
        if (!response || response.status === noResults) {
            this._cancelLocReq.set(id, true);
            runInAction(() => {
                doc[`${fieldKey}-lat`] = oldLatLng?.lat;
                doc[`${fieldKey}-lng`] = oldLatLng?.lng;
            });
            return false;
        }
        const { formatted_address } = response.results[0];
        if (formatted_address !== doc[`${fieldKey}-address`]) {
            this._cancelAddrReq.set(doc[Id], true);
            Doc.SetInPlace(doc, `${fieldKey}-address`, formatted_address, true);
        }
        return true;
    }

    @computed get reactiveContents() {
        this.responders.forEach(({ location, address }) => { location(); address(); });
        this.responders = [];
        return this.childLayoutPairs.map(({ layout }) => {
            const fieldKey = Doc.LayoutFieldKey(layout);
            const id = layout[Id];
            this.responders.push({
                location: computed(() => ({ lat: layout[`${fieldKey}-lat`], lng: layout[`${fieldKey}-lng`] }))
                    .observe(({ oldValue, newValue }) => {
                        if (this._cancelLocReq.get(id)) {
                            this._cancelLocReq.set(id, false);
                        } else if (newValue.lat !== undefined && newValue.lng !== undefined) {
                            this.respondToLocationChange(layout, fieldKey, newValue, oldValue);
                        }
                    }),
                address: computed(() => Cast(layout[`${fieldKey}-address`], "string", null))
                    .observe(({ oldValue, newValue }) => {
                        if (this._cancelAddrReq.get(id)) {
                            this._cancelAddrReq.set(id, false);
                        } else if (newValue?.length) {
                            this.respondToAddressChange(layout, fieldKey, newValue, oldValue);
                        }
                    })
            });
            return this.renderMarker(layout);
        });
    }

    render() {
        const { childLayoutPairs } = this;
        const { Document, fieldKey, active, google } = this.props;
        const mapLoc = this.getLocation(this.rootDoc, `${fieldKey}-mapCenter`, false);
        let center = mapLoc;
        if (center === undefined) {
            const childLocations = childLayoutPairs.map(({ layout }) => this.getLocation(layout, Doc.LayoutFieldKey(layout), false));
            center = childLocations.find(location => location) || defaultLocation;
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
                    onIdle={(_props?: IMapProps, map?: google.maps.Map) => {
                        if (this.layoutDoc.lockedTransform) {
                            // reset zoom (ideally, we could probably can tell the map to disallow zooming somehow instead)
                            map?.setZoom(center?.zoom || 10);
                            map?.setCenter({ lat: center?.lat!, lng: center?.lng! });
                        } else {
                            const zoom = map?.getZoom();
                            (center?.zoom !== zoom) && undoBatch(action(() => {
                                Document[`${fieldKey}-mapCenter-zoom`] = zoom;
                            }))();
                        }
                    }}
                    onDragend={(_props?: IMapProps, map?: google.maps.Map) => {
                        if (this.layoutDoc.lockedTransform) {
                            // reset the drag (ideally, we could probably can tell the map to disallow dragging somehow instead)
                            map?.setCenter({ lat: center?.lat!, lng: center?.lng! });
                        } else {
                            undoBatch(action(({ lat, lng }) => {
                                Document[`${fieldKey}-mapCenter-lat`] = lat();
                                Document[`${fieldKey}-mapCenter-lng`] = lng();
                            }))(map?.getCenter());
                        }
                    }}
                >
                    {this.reactiveContents}
                    {mapLoc ? this.renderMarker(this.rootDoc) : undefined}
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