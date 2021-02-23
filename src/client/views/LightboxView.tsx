import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { action, computed, observable } from 'mobx';
import { observer } from 'mobx-react';
import "normalize.css";
import * as React from 'react';
import { Doc, DocListCast, Opt } from '../../fields/Doc';
import { Cast, NumCast, StrCast } from '../../fields/Types';
import { emptyFunction, returnEmptyDoclist, returnEmptyFilter, returnTrue } from '../../Utils';
import { DocUtils } from '../documents/Documents';
import { DocumentManager } from '../util/DocumentManager';
import { LinkManager } from '../util/LinkManager';
import { SelectionManager } from '../util/SelectionManager';
import { Transform } from '../util/Transform';
import { TabDocView } from './collections/TabDocView';
import "./LightboxView.scss";
import { DocumentView } from './nodes/DocumentView';
import { DefaultStyleProvider } from './StyleProvider';

interface LightboxViewProps {
    PanelWidth: number;
    PanelHeight: number;
    maxBorder: number[];
}

@observer
export class LightboxView extends React.Component<LightboxViewProps> {

    @computed public static get LightboxDoc() { return this._doc; }
    @observable private static _doc: Opt<Doc>;
    @observable private static _docTarget: Opt<Doc>;
    @observable private static _tourMap: Opt<Doc[]> = [];   // list of all tours available from the current target
    @observable private static _docFilters: string[] = []; // filters
    private static _savedState: Opt<{ panX: Opt<number>, panY: Opt<number>, scale: Opt<number>, transition: Opt<string> }>;
    private static _history: Opt<{ doc: Doc, target?: Doc }[]> = [];
    private static _future: Opt<Doc[]> = [];
    private static _docView: Opt<DocumentView>;
    static path: { doc: Opt<Doc>, target: Opt<Doc>, history: Opt<{ doc: Doc, target?: Doc }[]>, future: Opt<Doc[]>, saved: Opt<{ panX: Opt<number>, panY: Opt<number>, scale: Opt<number>, transition: Opt<string> }> }[] = [];
    @action public static SetLightboxDoc(doc: Opt<Doc>, target?: Doc, future?: Doc[]) {
        if (!doc) {
            this._docFilters && (this._docFilters.length = 0);
            if (this.LightboxDoc) {
                this.LightboxDoc._panX = this._savedState?.panX;
                this.LightboxDoc._panY = this._savedState?.panY;
                this.LightboxDoc._viewScale = this._savedState?.scale;
                this.LightboxDoc._viewTransition = this._savedState?.transition;
            }
            this._future = this._history = [];
        } else {
            TabDocView.PinDoc(doc, { hidePresBox: true });
            this._history ? this._history.push({ doc, target }) : this._history = [{ doc, target }];
            this._savedState = {
                panX: Cast(doc._panX, "number", null),
                panY: Cast(doc._panY, "number", null),
                scale: Cast(doc._viewScale, "number", null),
                transition: Cast(doc._viewTransition, "string", null)
            };
        }
        if (future) {
            this._future = future.slice().sort((a, b) => NumCast(b._timecodeToShow) - NumCast(a._timecodeToShow)).sort((a, b) => DocListCast(a.links).length - DocListCast(b.links).length);
        }
        this._doc = doc;
        this._docTarget = target || doc;
        this._tourMap = DocListCast(doc?.links).map(link => {
            const opp = LinkManager.getOppositeAnchor(link, doc!);
            return opp?.TourMap ? opp : undefined;
        }).filter(m => m).map(m => m!);

        return true;
    }
    public static IsLightboxDocView(path: DocumentView[]) { return path.includes(this._docView!); }
    @computed get leftBorder() { return Math.min(this.props.PanelWidth / 4, this.props.maxBorder[0]); }
    @computed get topBorder() { return Math.min(this.props.PanelHeight / 4, this.props.maxBorder[1]); }
    lightboxWidth = () => this.props.PanelWidth - this.leftBorder * 2;
    lightboxHeight = () => this.props.PanelHeight - this.topBorder * 2;
    lightboxScreenToLocal = () => new Transform(-this.leftBorder, -this.topBorder, 1);
    navBtn = (left: Opt<string | number>, bottom: Opt<number>, top: number, icon: string, display: () => string, click: (e: React.MouseEvent) => void, color?: string) => {
        return <div className="lightboxView-navBtn-frame" style={{
            display: display(),
            left,
            width: bottom !== undefined ? undefined : Math.min(this.props.PanelWidth / 4, this.props.maxBorder[0]),
            bottom
        }}>
            <div className="lightboxView-navBtn" title={color} style={{ top, color: color ? "red" : "white", background: color ? "white" : undefined }}
                onClick={click}>
                <div style={{ height: 10 }}>{color}</div>
                <FontAwesomeIcon icon={icon as any} size="3x" />
            </div>
        </div>;
    }
    public static GetSavedState(doc: Doc) {
        return this.LightboxDoc === doc && this._savedState ? this._savedState : undefined;
    }

    // adds a cookie to the lightbox view - the cookie becomes part of a filter which will display any documents whose cookie metadata field matches this cookie
    public static SetCookie(cookie: string) {
        if (this.LightboxDoc && cookie) {
            this._docFilters = (f => this._docFilters ? [this._docFilters.push(f) as any, this._docFilters][1] : [f])(`cookies:${cookie}:provide`);
        }
    }
    public static AddDocTab = (doc: Doc, location: string) => {
        SelectionManager.DeselectAll();
        return LightboxView.SetLightboxDoc(doc, undefined,
            [...DocListCast(doc[Doc.LayoutFieldKey(doc)]),
            ...DocListCast(doc[Doc.LayoutFieldKey(doc) + "-annotations"]),
            ...(LightboxView._future ?? [])
            ]
                .sort((a: Doc, b: Doc) => NumCast(b._timecodeToShow) - NumCast(a._timecodeToShow)));
    }
    docFilters = () => LightboxView._docFilters || [];
    addDocTab = LightboxView.AddDocTab;
    @action public static Next() {
        const doc = LightboxView._doc!;
        const target = LightboxView._docTarget = LightboxView._future?.pop();
        const docView = target && DocumentManager.Instance.getLightboxDocumentView(target);
        if (docView && target) {
            docView.focus(target, { willZoom: true, scale: 0.9 });
            if (LightboxView._history?.lastElement().target !== target) LightboxView._history?.push({ doc, target: LightboxView._docTarget });
        } else {
            if (!target && LightboxView.path.length) {
                const saved = LightboxView._savedState;
                if (LightboxView.LightboxDoc) {
                    LightboxView.LightboxDoc._panX = saved?.panX;
                    LightboxView.LightboxDoc._panY = saved?.panY;
                    LightboxView.LightboxDoc._viewScale = saved?.scale;
                    LightboxView.LightboxDoc._viewTransition = saved?.transition;
                }
                const pop = LightboxView.path.pop();
                if (pop) {
                    LightboxView._doc = pop.doc;
                    LightboxView._docTarget = pop.target;
                    LightboxView._future = pop.future;
                    LightboxView._history = pop.history;
                    LightboxView._savedState = pop.saved;
                }
            } else {
                LightboxView.SetLightboxDoc(target);
            }
        }
        LightboxView._tourMap = DocListCast(LightboxView._docTarget?.links).map(link => {
            const opp = LinkManager.getOppositeAnchor(link, LightboxView._docTarget!);
            return opp?.TourMap ? opp : undefined;
        }).filter(m => m).map(m => m!);
    }

    @action public static Previous() {
        const previous = LightboxView._history?.pop();
        if (!previous || !LightboxView._history?.length) {
            LightboxView.SetLightboxDoc(undefined);
            return;
        }
        const { doc, target } = LightboxView._history?.lastElement();
        const docView = target && DocumentManager.Instance.getLightboxDocumentView(target);
        if (docView && target) {
            LightboxView._doc = doc;
            LightboxView._docTarget = target || doc;
            if (LightboxView._future?.lastElement() !== previous.target || previous.doc) LightboxView._future?.push(previous.target || previous.doc);
            docView.focus(target, { willZoom: true, scale: 0.9 });
        } else {
            LightboxView._doc = doc;
            LightboxView._docTarget = target || doc;
        }
        LightboxView._tourMap = DocListCast(LightboxView._docTarget?.links).map(link => {
            const opp = LinkManager.getOppositeAnchor(link, LightboxView._docTarget!);
            return opp?.TourMap ? opp : undefined;
        }).filter(m => m).map(m => m!);
    }
    @action
    stepInto = () => {
        LightboxView.path.push({
            doc: LightboxView.LightboxDoc,
            target: LightboxView._docTarget,
            future: LightboxView._future,
            history: LightboxView._history,
            saved: LightboxView._savedState
        });
        const tours = LightboxView._tourMap;
        if (tours && tours.length) {
            const fieldKey = Doc.LayoutFieldKey(tours[0]);
            LightboxView._future?.push(...DocListCast(tours[0][fieldKey]).reverse());
        } else {
            const coll = LightboxView._docTarget;
            if (coll) {
                const fieldKey = Doc.LayoutFieldKey(coll);
                LightboxView.SetLightboxDoc(coll, undefined, [...DocListCast(coll[fieldKey]), ...DocListCast(coll[fieldKey + "-annotations"])]);
                TabDocView.PinDoc(coll, { hidePresBox: true });
            }
        }
        setTimeout(LightboxView.Next);
    }

    fitToBox = () => LightboxView._docTarget === LightboxView.LightboxDoc;
    render() {
        let downx = 0, downy = 0;
        return !LightboxView.LightboxDoc ? (null) :
            <div className="lightboxView-frame"
                onPointerDown={e => { downx = e.clientX; downy = e.clientY; }}
                onClick={e => {
                    if (Math.abs(downx - e.clientX) < 4 && Math.abs(downy - e.clientY) < 4) {
                        LightboxView.SetLightboxDoc(undefined);
                    }
                }}  >
                <div className="lightboxView-contents" style={{
                    left: this.leftBorder,
                    top: this.topBorder,
                    width: this.lightboxWidth(),
                    height: this.lightboxHeight()
                }}>
                    <DocumentView ref={action((r: DocumentView | null) => {
                        LightboxView._docView = r !== null ? r : undefined;
                        setTimeout(action(() => {
                            const vals = r?.ComponentView?.freeformData?.();
                            if (vals && r) {
                                r.layoutDoc._panX = vals.panX;
                                r.layoutDoc._panY = vals.panY;
                                r.layoutDoc._viewScale = vals.scale;
                            }
                            r && (LightboxView._docTarget = undefined);
                        }));
                    })}
                        Document={LightboxView.LightboxDoc}
                        DataDoc={undefined}
                        addDocument={undefined}
                        fitContentsToDoc={this.fitToBox}
                        addDocTab={this.addDocTab}
                        pinToPres={TabDocView.PinDoc}
                        rootSelected={returnTrue}
                        docViewPath={returnEmptyDoclist}
                        docFilters={this.docFilters}
                        removeDocument={undefined}
                        styleProvider={DefaultStyleProvider}
                        layerProvider={returnTrue}
                        ScreenToLocalTransform={this.lightboxScreenToLocal}
                        PanelWidth={this.lightboxWidth}
                        PanelHeight={this.lightboxHeight}
                        focus={DocUtils.DefaultFocus}
                        parentActive={returnTrue}
                        whenActiveChanged={emptyFunction}
                        bringToFront={emptyFunction}
                        docRangeFilters={returnEmptyFilter}
                        searchFilterDocs={returnEmptyDoclist}
                        ContainingCollectionView={undefined}
                        ContainingCollectionDoc={undefined}
                        renderDepth={0} />
                </div>
                {this.navBtn(0, undefined, this.props.PanelHeight / 2 - 12.50, "chevron-left",
                    () => LightboxView.LightboxDoc && LightboxView._history?.length ? "" : "none", e => {
                        e.stopPropagation();
                        LightboxView.Previous();
                    })}
                {this.navBtn(this.props.PanelWidth - Math.min(this.props.PanelWidth / 4, this.props.maxBorder[0]), undefined, this.props.PanelHeight / 2 - 12.50, "chevron-right",
                    () => LightboxView.LightboxDoc && LightboxView._future?.length ? "" : "none", e => {
                        e.stopPropagation();
                        LightboxView.Next();
                    })}
                {this.navBtn("50%", 0, 0, "chevron-down",
                    () => LightboxView.LightboxDoc && LightboxView._future?.length ? "" : "none", e => {
                        e.stopPropagation();
                        this.stepInto();
                    },
                    StrCast(LightboxView._tourMap?.lastElement()?.TourMap)
                )}
            </div>;
    }
}