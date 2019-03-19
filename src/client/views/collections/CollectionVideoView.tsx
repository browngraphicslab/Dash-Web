import { action, computed, observable } from "mobx";
import { observer } from "mobx-react";
import { Document } from "../../../fields/Document";
import { KeyStore } from "../../../fields/KeyStore";
import { ContextMenu } from "../ContextMenu";
import { CollectionView, CollectionViewType } from "./CollectionView";
import { CollectionViewProps } from "./CollectionViewBase";
import React = require("react");
import { FieldId } from "../../../fields/Field";
import "./CollectionVideoView.scss"


@observer
export class CollectionVideoView extends React.Component<CollectionViewProps> {

    public static LayoutString(fieldKey: string = "DataKey") {
        return `<${CollectionVideoView.name} Document={Document}
                    ScreenToLocalTransform={ScreenToLocalTransform} fieldKey={${fieldKey}} panelWidth={PanelWidth} panelHeight={PanelHeight} isSelected={isSelected} select={select} bindings={bindings}
                    isTopMost={isTopMost} SelectOnLoad={selectOnLoad} BackgroundView={BackgroundView} focus={focus}/>`;
    }

    private _mainCont = React.createRef<HTMLDivElement>();

    private get uIButtons() {
        let scaling = Math.min(1.8, this.props.ScreenToLocalTransform().transformDirection(1, 1)[0]);
        return ([
            <div className="collectionVideoView-time" key="time" onPointerDown={this.onResetDown} style={{ transform: `scale(${scaling}, ${scaling})` }}>
                <span>{"" + Math.round(this.ctime)}</span>
                <span style={{ fontSize: 8 }}>{" " + Math.round((this.ctime - Math.trunc(this.ctime)) * 100)}</span>
            </div>,
            <div className="collectionVideoView-play" key="play" onPointerDown={this.onPlayDown} style={{ transform: `scale(${scaling}, ${scaling})` }}>
                {this.playing ? "\"" : ">"}
            </div>,
            <div className="collectionVideoView-full" key="full" onPointerDown={this.onFullDown} style={{ transform: `scale(${scaling}, ${scaling})` }}>
                F
                </div>
        ]);
    }


    // "inherited" CollectionView API starts here...

    @observable
    public SelectedDocs: FieldId[] = []
    public active: () => boolean = () => CollectionView.Active(this);

    addDocument = (doc: Document, allowDuplicates: boolean): void => { CollectionView.AddDocument(this.props, doc, allowDuplicates); }
    removeDocument = (doc: Document): boolean => { return CollectionView.RemoveDocument(this.props, doc); }

    specificContextMenu = (e: React.MouseEvent): void => {
        if (!e.isPropagationStopped() && this.props.Document.Id != "mainDoc") { // need to test this because GoldenLayout causes a parallel hierarchy in the React DOM for its children and the main document view7
            ContextMenu.Instance.addItem({ description: "VideoOptions", event: () => { } });
        }
    }

    get collectionViewType(): CollectionViewType { return CollectionViewType.Freeform; }
    get subView(): any { return CollectionView.SubView(this); }

    componentDidMount() {
        this.updateTimecode();
    }

    get player(): HTMLVideoElement | undefined {
        return this._mainCont.current ? this._mainCont.current.getElementsByTagName("video")[0] : undefined;
    }

    @action
    updateTimecode = () => {
        if (this.player) {
            this.ctime = this.player.currentTime;
            this.props.Document.SetNumber(KeyStore.CurPage, Math.round(this.ctime));
        }
        setTimeout(() => this.updateTimecode(), 100)
    }


    @observable
    ctime: number = 0
    @observable
    playing: boolean = false;

    @action
    onPlayDown = () => {
        if (this.player) {
            if (this.player.paused) {
                this.player.play();
                this.playing = true;
            } else {
                this.player.pause();
                this.playing = false;
            }
        }
    }
    @action
    onFullDown = (e: React.PointerEvent) => {
        if (this.player) {
            this.player.requestFullscreen();
            e.stopPropagation();
            e.preventDefault();
        }
    }

    @action
    onResetDown = () => {
        if (this.player) {
            this.player.pause();
            this.player.currentTime = 0;
        }

    }

    render() {
        return (<div className="collectionVideoView-cont" ref={this._mainCont} onContextMenu={this.specificContextMenu}>
            {this.subView}
            {this.props.isSelected() ? this.uIButtons : (null)}
        </div>)
    }
}