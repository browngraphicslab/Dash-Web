import { action, computed, observable } from "mobx";
import { observer } from "mobx-react";
import { Document } from "../../../fields/Document";
import { KeyStore } from "../../../fields/KeyStore";
import { ContextMenu } from "../ContextMenu";
import { CollectionView, CollectionViewType } from "./CollectionView";
import { CollectionViewProps } from "./CollectionViewBase";
import React = require("react");
import { FieldId } from "../../../fields/Field";
import { ReplaceAroundStep } from "prosemirror-transform";
import "./CollectionVideoView.scss"


@observer
export class CollectionVideoView extends React.Component<CollectionViewProps> {

    public static LayoutString(fieldKey: string = "DataKey") {
        return `<${CollectionVideoView.name} Document={Document}
                    ScreenToLocalTransform={ScreenToLocalTransform} fieldKey={${fieldKey}} panelWidth={PanelWidth} panelHeight={PanelHeight} isSelected={isSelected} select={select} bindings={bindings}
                    isTopMost={isTopMost} SelectOnLoad={selectOnLoad} BackgroundView={BackgroundView} focus={focus}/>`;
    }

    private _mainCont = React.createRef<HTMLDivElement>();
    // "inherited" CollectionView API starts here...

    @observable
    public SelectedDocs: FieldId[] = []
    public active: () => boolean = () => CollectionView.Active(this);

    addDocument = (doc: Document): void => { CollectionView.AddDocument(this.props, doc); }
    removeDocument = (doc: Document): boolean => { return CollectionView.RemoveDocument(this.props, doc); }

    specificContextMenu = (e: React.MouseEvent): void => {
        if (!e.isPropagationStopped() && this.props.Document.Id != "mainDoc") { // need to test this because GoldenLayout causes a parallel hierarchy in the React DOM for its children and the main document view7
            ContextMenu.Instance.addItem({ description: "VideoOptions", event: () => { } });
        }
    }

    get collectionViewType(): CollectionViewType { return CollectionViewType.Freeform; }
    get subView(): any { return CollectionView.SubView(this); }

    componentDidMount() {
        this.repete();
    }

    player = (): HTMLVideoElement => {
        return this._mainCont.current!.getElementsByTagName("video")[0];
    }

    @action
    repete = () => {
        if (this.player()) {
            this.ctime = this.player().currentTime;
            this.props.Document.SetNumber(KeyStore.CurPage, Math.round(this.ctime));
        }
        setTimeout(() => this.repete(), 100)
    }


    @observable
    ctime: number = 0
    @observable
    playing: boolean = false;

    @action
    onPlayDown = () => {
        if (this.player()) {
            if (this.player().paused) {
                this.player().play();
                this.playing = true;
            } else {
                this.player().pause();
                this.playing = false;
            }
        }
    }
    @action
    onFullDown = (e: React.PointerEvent) => {
        if (this.player()) {
            this.player().requestFullscreen();
            e.stopPropagation();
            e.preventDefault();
        }
    }

    @action
    onResetDown = () => {
        if (this.player()) {
            this.player().pause();
            this.player().currentTime = 0;
        }

    }

    render() {
        return (<div className="collectionVideoView-cont" ref={this._mainCont} onContextMenu={this.specificContextMenu}>
            <div className="collectionVideoView-controls" >
                {this.subView}
                <div className="collectionVideoView-time" onPointerDown={this.onResetDown}>
                    <span>{"" + Math.round(this.ctime)}</span>
                    <span style={{ fontSize: 8 }}>{" " + Math.round((this.ctime - Math.trunc(this.ctime)) * 100)}</span>
                </div>
                <div className="collectionVideoView-play" onPointerDown={this.onPlayDown}>
                    {this.playing ? "\"" : ">"}
                </div>
                <div className="collectionVideoView-full" onPointerDown={this.onFullDown}>
                    F
                </div>
            </div>
        </div>)
    }
}