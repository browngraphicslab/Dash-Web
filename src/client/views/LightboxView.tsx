import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { action, observable, computed } from 'mobx';
import { observer } from 'mobx-react';
import "normalize.css";
import * as React from 'react';
import { Doc, Opt, DocListCast } from '../../fields/Doc';
import { emptyFunction, emptyPath, returnEmptyDoclist, returnEmptyFilter, returnFalse, returnTrue } from '../../Utils';
import { Transform } from '../util/Transform';
import "./LightboxView.scss";
import { DocumentView } from './nodes/DocumentView';
import { DefaultStyleProvider } from './StyleProvider';
import { DocUtils } from '../documents/Documents';
import { DocumentManager } from '../util/DocumentManager';
import { SelectionManager } from '../util/SelectionManager';
import { TabDocView } from './collections/TabDocView';
import { Cast, NumCast } from '../../fields/Types';
import { path } from 'animejs';

interface LightboxViewProps {
    PanelWidth: number;
    PanelHeight: number;
    maxBorder: number[];
}

@observer
export class LightboxView extends React.Component<LightboxViewProps> {
    public static SavedState: Opt<{ panX: Opt<number>, panY: Opt<number>, scale: Opt<number>, transition: Opt<string> }>;
    @observable static LightboxDoc: Opt<Doc>;
    @observable static LightboxDocTarget: Opt<Doc>;
    public static LightboxHistory: Opt<Doc[]> = [];
    public static LightboxFuture: Opt<Doc[]> = [];
    public static LightboxDocView: Opt<DocumentView>;
    static path: { doc: Opt<Doc>, target: Opt<Doc>, history: Opt<Doc[]>, future: Opt<Doc[]>, saved: Opt<{ panX: Opt<number>, panY: Opt<number>, scale: Opt<number>, transition: Opt<string> }> }[] = [];
    @action public static SetLightboxDoc(doc: Opt<Doc>, future?: Doc[]) {
        if (!doc) {
            if (this.LightboxDoc) {
                this.LightboxDoc._panX = this.SavedState?.panX;
                this.LightboxDoc._panY = this.SavedState?.panY;
                this.LightboxDoc._viewScale = this.SavedState?.scale;
                this.LightboxDoc._viewTransition = this.SavedState?.transition;
            }
            LightboxView.LightboxFuture = LightboxView.LightboxHistory = [];
        } else {
            LightboxView.SavedState = {
                panX: Cast(doc._panX, "number", null),
                panY: Cast(doc._panY, "number", null),
                scale: Cast(doc._viewScale, "number", null),
                transition: Cast(doc._viewTransition, "string", null)
            };
        }
        if (future) {
            LightboxView.LightboxFuture = future.slice().sort((a, b) => NumCast(b._timecodeToShow) - NumCast(a._timecodeToShow)).sort((a, b) => DocListCast(a.links).length - DocListCast(b.links).length);
        }
        LightboxView.LightboxDoc = LightboxView.LightboxDocTarget = doc;

        return true;
    }
    public static IsLightboxDocView(path: DocumentView[]) { return path.includes(LightboxView.LightboxDocView!); }
    @computed get leftBorder() { return Math.min(this.props.PanelWidth / 4, this.props.maxBorder[0]); }
    @computed get topBorder() { return Math.min(this.props.PanelHeight / 4, this.props.maxBorder[1]); }
    lightboxWidth = () => this.props.PanelWidth - this.leftBorder * 2;
    lightboxHeight = () => this.props.PanelHeight - this.topBorder * 2;
    lightboxScreenToLocal = () => new Transform(-this.leftBorder, -this.topBorder, 1);
    navBtn = (left: Opt<string | number>, bottom: Opt<number>, top: number, icon: string, display: () => string, click: (e: React.MouseEvent) => void) => {
        return <div className="lightboxView-navBtn-frame" style={{
            display: display(),
            left,
            width: bottom !== undefined ? undefined : Math.min(this.props.PanelWidth / 4, this.props.maxBorder[0]),
            bottom
        }}>
            <div className="lightboxView-navBtn" style={{ top }}
                onClick={click}>
                <FontAwesomeIcon icon={icon as any} size="3x" />
            </div>
        </div>;
    }
    public static AddDocTab = (doc: Doc, location: string) => {
        SelectionManager.DeselectAll();
        return LightboxView.SetLightboxDoc(doc,
            [...DocListCast(doc[Doc.LayoutFieldKey(doc)]),
            ...DocListCast(doc[Doc.LayoutFieldKey(doc) + "-annotations"]),
            ...(LightboxView.LightboxFuture ?? [])
            ]
                .sort((a: Doc, b: Doc) => NumCast(b._timecodeToShow) - NumCast(a._timecodeToShow)));
    }
    addDocTab = LightboxView.AddDocTab;
    @action
    stepForward = () => {
        const target = LightboxView.LightboxDocTarget = LightboxView.LightboxFuture?.pop();
        const docView = target && DocumentManager.Instance.getLightboxDocumentView(target);
        if (docView && target) {
            docView.focus(target, { willZoom: true, scale: 0.9 });
            if (LightboxView.LightboxHistory?.lastElement() !== target) LightboxView.LightboxHistory?.push(target);
        } else {
            if (!target && LightboxView.path.length) {
                const saved = LightboxView.SavedState;
                if (LightboxView.LightboxDoc) {
                    LightboxView.LightboxDoc._panX = saved?.panX;
                    LightboxView.LightboxDoc._panY = saved?.panY;
                    LightboxView.LightboxDoc._viewScale = saved?.scale;
                    LightboxView.LightboxDoc._viewTransition = saved?.transition;
                }
                const pop = LightboxView.path.pop();
                if (pop) {
                    LightboxView.LightboxDoc = pop.doc;
                    LightboxView.LightboxDocTarget = pop.target;
                    LightboxView.LightboxFuture = pop.future;
                    LightboxView.LightboxHistory = pop.history;
                    LightboxView.SavedState = pop.saved;
                }
            } else {
                LightboxView.SetLightboxDoc(target);
            }
        }
    }
    @action
    stepBackward = () => {
        const previous = LightboxView.LightboxHistory?.pop();
        const target = LightboxView.LightboxDocTarget = LightboxView.LightboxHistory?.lastElement();
        const docView = target && DocumentManager.Instance.getLightboxDocumentView(target);
        if (docView && target) {
            if (LightboxView.LightboxFuture?.lastElement() !== previous) LightboxView.LightboxFuture?.push(previous!);
            docView.focus(target, { willZoom: true, scale: 0.9 });
        } else {
            LightboxView.SetLightboxDoc(target);
        }
    }
    @action
    stepInto = () => {
        LightboxView.path.push({
            doc: LightboxView.LightboxDoc,
            target: LightboxView.LightboxDocTarget,
            future: LightboxView.LightboxFuture,
            history: LightboxView.LightboxHistory,
            saved: LightboxView.SavedState
        });
        const coll = LightboxView.LightboxDocTarget;
        if (coll) {
            const fieldKey = Doc.LayoutFieldKey(coll);
            LightboxView.SetLightboxDoc(coll, [...DocListCast(coll[fieldKey]), ...DocListCast(coll[fieldKey + "-annotations"])]);
            TabDocView.PinDoc(coll, { hidePresBox: true });
        }
        setTimeout(() => this.stepForward());
    }

    fitToBox = () => LightboxView.LightboxDocTarget === LightboxView.LightboxDoc;
    render() {
        if (LightboxView.LightboxHistory?.lastElement() !== LightboxView.LightboxDoc) LightboxView.LightboxHistory?.push(LightboxView.LightboxDoc!);
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
                        LightboxView.LightboxDocView = r !== null ? r : undefined;
                        setTimeout(action(() => {
                            const vals = r?.ComponentView?.freeformData?.();
                            if (vals && r) {
                                r.layoutDoc._panX = vals.panX;
                                r.layoutDoc._panY = vals.panY;
                                r.layoutDoc._viewScale = vals.scale;
                            }
                            LightboxView.LightboxDocTarget = undefined;
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
                        docFilters={returnEmptyFilter}
                        docRangeFilters={returnEmptyFilter}
                        searchFilterDocs={returnEmptyDoclist}
                        ContainingCollectionView={undefined}
                        ContainingCollectionDoc={undefined}
                        renderDepth={0} />
                </div>
                {this.navBtn(0, undefined, this.props.PanelHeight / 2 - 12.50, "chevron-left",
                    () => LightboxView.LightboxDoc && LightboxView.LightboxHistory?.length ? "" : "none", e => {
                        e.stopPropagation();
                        this.stepBackward();
                    })}
                {this.navBtn(this.props.PanelWidth - Math.min(this.props.PanelWidth / 4, this.props.maxBorder[0]), undefined, this.props.PanelHeight / 2 - 12.50, "chevron-right",
                    () => LightboxView.LightboxDoc && LightboxView.LightboxFuture?.length ? "" : "none", e => {
                        e.stopPropagation();
                        this.stepForward();
                    })}
                {this.navBtn("50%", 0, 0, "chevron-down",
                    () => LightboxView.LightboxDoc && LightboxView.LightboxFuture?.length ? "" : "none", e => {
                        e.stopPropagation();
                        this.stepInto();
                    })}
            </div>;
    }
}