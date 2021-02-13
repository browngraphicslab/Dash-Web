import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { action, observable, computed } from 'mobx';
import { observer } from 'mobx-react';
import "normalize.css";
import * as React from 'react';
import { Doc, Opt } from '../../fields/Doc';
import { emptyFunction, emptyPath, returnEmptyDoclist, returnEmptyFilter, returnFalse, returnTrue } from '../../Utils';
import { Transform } from '../util/Transform';
import "./LightboxView.scss";
import { DocumentView } from './nodes/DocumentView';
import { DefaultStyleProvider } from './StyleProvider';
import { DocUtils } from '../documents/Documents';
import { DocumentManager } from '../util/DocumentManager';
import { SelectionManager } from '../util/SelectionManager';
import { TabDocView } from './collections/TabDocView';
import { Cast } from '../../fields/Types';

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
            LightboxView.LightboxFuture = future.slice();
        }
        LightboxView.LightboxDoc = LightboxView.LightboxDocTarget = doc;

        return true;
    }
    public static IsLightboxDocView(path: DocumentView[]) { return path.includes(LightboxView.LightboxDocView.current!); }
    public static LightboxHistory: (Opt<Doc>)[] = [];
    public static LightboxFuture: (Opt<Doc>)[] = [];
    public static LightboxDocView = React.createRef<DocumentView>();
    @computed get leftBorder() { return Math.min(this.props.PanelWidth / 4, this.props.maxBorder[0]); }
    @computed get topBorder() { return Math.min(this.props.PanelHeight / 4, this.props.maxBorder[1]); }
    lightboxWidth = () => this.props.PanelWidth - this.leftBorder * 2;
    lightboxHeight = () => this.props.PanelHeight - this.topBorder * 2;
    lightboxScreenToLocal = () => new Transform(-this.leftBorder, -this.topBorder, 1);
    navBtn = (left: Opt<number>, icon: string, display: () => string, click: (e: React.MouseEvent) => void) => {
        return <div className="lightboxView-navBtn-frame" style={{
            display: display(),
            left,
            width: Math.min(this.props.PanelWidth / 4, this.props.maxBorder[0])
        }}>
            <div className="lightboxView-navBtn" style={{ top: this.props.PanelHeight / 2 - 12.50 }}
                onClick={click}>
                <FontAwesomeIcon icon={icon as any} size="3x" />
            </div>
        </div>;
    }
    addDocTab = (doc: Doc, location: string) => {
        SelectionManager.DeselectAll();
        return LightboxView.SetLightboxDoc(doc);
    }

    fitToBox = () => LightboxView.LightboxDocTarget === LightboxView.LightboxDoc;
    render() {
        if (LightboxView.LightboxHistory.lastElement() !== LightboxView.LightboxDoc) LightboxView.LightboxHistory.push(LightboxView.LightboxDoc);
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
                    <DocumentView ref={LightboxView.LightboxDocView}
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
                {this.navBtn(undefined, "chevron-left",
                    () => LightboxView.LightboxDoc && LightboxView.LightboxHistory.length ? "" : "none",
                    action(e => {
                        e.stopPropagation();
                        const previous = LightboxView.LightboxHistory.pop();
                        const target = LightboxView.LightboxDocTarget = LightboxView.LightboxHistory.lastElement();
                        const docView = target && DocumentManager.Instance.getLightboxDocumentView(target);
                        if (docView && target) {
                            if (LightboxView.LightboxFuture.lastElement() !== previous) LightboxView.LightboxFuture.push(previous);
                            docView.focus(target, true, 0.9);
                        } else {
                            LightboxView.SetLightboxDoc(target);
                        }
                    }))}
                {this.navBtn(this.props.PanelWidth - Math.min(this.props.PanelWidth / 4, this.props.maxBorder[0]), "chevron-right",
                    () => LightboxView.LightboxDoc && LightboxView.LightboxFuture.length ? "" : "none",
                    action(e => {
                        e.stopPropagation();
                        const target = LightboxView.LightboxDocTarget = LightboxView.LightboxFuture.pop();
                        const docView = target && DocumentManager.Instance.getLightboxDocumentView(target);
                        if (docView && target) {
                            docView.focus(target, true, 0.9);
                            if (LightboxView.LightboxHistory.lastElement() !== target) LightboxView.LightboxHistory.push(target);
                        } else {
                            LightboxView.SetLightboxDoc(target);
                        }
                    }))}

            </div>;
    }
}