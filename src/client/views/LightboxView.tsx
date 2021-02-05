import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { action, observable } from 'mobx';
import { observer } from 'mobx-react';
import "normalize.css";
import * as React from 'react';
import { Doc, Opt } from '../../fields/Doc';
import { emptyFunction, emptyPath, returnEmptyDoclist, returnEmptyFilter, returnFalse, returnTrue } from '../../Utils';
import { Transform } from '../util/Transform';
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
    @observable public static LightboxDoc: Opt<Doc>;
    public static LightboxHistory: (Opt<Doc>)[] = [];
    public static LightboxFuture: (Opt<Doc>)[] = [];
    public static LightboxDocView = React.createRef<DocumentView>();
    public LightboxDocView = React.createRef<DocumentView>();
    lightboxWidth = () => this.props.PanelWidth - Math.min(this.props.PanelWidth / 4, this.props.maxBorder[0]) * 2;
    lightboxHeight = () => this.props.PanelHeight - Math.min(this.props.PanelHeight / 4, this.props.maxBorder[1]) * 2;
    lightboxScreenToLocal = () => new Transform(-Math.min(this.props.PanelWidth / 4, this.props.maxBorder[0]), -Math.min(this.props.PanelHeight / 4, this.props.maxBorder[1]), 1);
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

    render() {
        console.log("ph = " + this.props.PanelHeight);
        if (LightboxView.LightboxHistory.lastElement() !== LightboxView.LightboxDoc) LightboxView.LightboxHistory.push(LightboxView.LightboxDoc);
        let downx = 0, downy = 0;
        return !LightboxView.LightboxDoc ? (null) :
            <div className="lightboxView-frame"
                onPointerDown={e => { downx = e.clientX; downy = e.clientY; }}
                onClick={action(e => {
                    if (Math.abs(downx - e.clientX) < 4 && Math.abs(downy - e.clientY) < 4) {
                        LightboxView.LightboxHistory = [];
                        LightboxView.LightboxFuture = [];
                        LightboxView.LightboxDoc = undefined;
                    }
                })}  >
                <div className="lightboxView-contents" style={{
                    left: Math.min(this.props.PanelWidth / 4, this.props.maxBorder[0]),
                    top: Math.min(this.props.PanelHeight / 4, this.props.maxBorder[1]),
                    width: this.props.PanelWidth - Math.min(this.props.PanelWidth / 4, this.props.maxBorder[0]) * 2,
                    height: this.props.PanelHeight - Math.min(this.props.PanelHeight / 4, this.props.maxBorder[1]) * 2
                }}>
                    <DocumentView ref={this.LightboxDocView}
                        Document={LightboxView.LightboxDoc}
                        DataDoc={undefined}
                        addDocument={undefined}
                        addDocTab={returnFalse}
                        pinToPres={emptyFunction}
                        rootSelected={returnTrue}
                        docViewPath={emptyPath}
                        removeDocument={undefined}
                        styleProvider={DefaultStyleProvider}
                        layerProvider={undefined}
                        ScreenToLocalTransform={this.lightboxScreenToLocal}
                        PanelWidth={this.lightboxWidth}
                        PanelHeight={this.lightboxHeight}
                        focus={emptyFunction}
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
                        const popped = LightboxView.LightboxHistory.pop();
                        if (LightboxView.LightboxHistory.lastElement() !== LightboxView.LightboxFuture.lastElement()) LightboxView.LightboxFuture.push(popped);
                        LightboxView.LightboxDoc = LightboxView.LightboxHistory.lastElement();
                    }))}
                {this.navBtn(this.props.PanelWidth - Math.min(this.props.PanelWidth / 4, this.props.maxBorder[0]), "chevron-right",
                    () => LightboxView.LightboxDoc && LightboxView.LightboxFuture.length ? "" : "none",
                    action(e => {
                        e.stopPropagation();
                        LightboxView.LightboxDoc = LightboxView.LightboxFuture.pop();
                    }))}

            </div>;
    }
}