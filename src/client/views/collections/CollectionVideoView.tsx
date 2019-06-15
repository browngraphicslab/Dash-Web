import { action, observable, trace } from "mobx";
import * as htmlToImage from "html-to-image";
import { observer } from "mobx-react";
import { ContextMenu } from "../ContextMenu";
import { CollectionViewType, CollectionBaseView, CollectionRenderProps } from "./CollectionBaseView";
import React = require("react");
import "./CollectionVideoView.scss";
import { CollectionFreeFormView } from "./collectionFreeForm/CollectionFreeFormView";
import { FieldView, FieldViewProps } from "../nodes/FieldView";
import { emptyFunction, Utils } from "../../../Utils";
import { Id } from "../../../new_fields/FieldSymbols";
import { VideoBox } from "../nodes/VideoBox";
import { NumCast, Cast, StrCast } from "../../../new_fields/Types";
import { VideoField } from "../../../new_fields/URLField";
import { SearchBox } from "../SearchBox";
import { DocServer } from "../../DocServer";
import { Docs, DocUtils } from "../../documents/Documents";


@observer
export class CollectionVideoView extends React.Component<FieldViewProps> {
    private _videoBox?: VideoBox;

    public static LayoutString(fieldKey: string = "data") {
        return FieldView.LayoutString(CollectionVideoView, fieldKey);
    }
    private get uIButtons() {
        let scaling = Math.min(1.8, this.props.ScreenToLocalTransform().Scale);
        let curTime = NumCast(this.props.Document.curPage);
        return ([
            <div className="collectionVideoView-time" key="time" onPointerDown={this.onResetDown} style={{ transform: `scale(${scaling}, ${scaling})` }}>
                <span>{"" + Math.round(curTime)}</span>
                <span style={{ fontSize: 8 }}>{" " + Math.round((curTime - Math.trunc(curTime)) * 100)}</span>
            </div>,
            <div className="collectionVideoView-play" key="play" onPointerDown={this.onPlayDown} style={{ transform: `scale(${scaling}, ${scaling})` }}>
                {this._videoBox && this._videoBox.Playing ? "\"" : ">"}
            </div>,
            <div className="collectionVideoView-full" key="full" onPointerDown={this.onFullDown} style={{ transform: `scale(${scaling}, ${scaling})` }}>
                F
                </div>
        ]);
    }

    @action
    onPlayDown = () => {
        if (this._videoBox && this._videoBox.player) {
            if (this._videoBox.Playing) {
                this._videoBox.Pause();
            } else {
                this._videoBox.Play();
            }
        }
    }

    @action
    onFullDown = (e: React.PointerEvent) => {
        if (this._videoBox) {
            this._videoBox.FullScreen();
            e.stopPropagation();
            e.preventDefault();
        }
    }

    @action
    onResetDown = () => {
        if (this._videoBox) {
            this._videoBox.Pause();
            this.props.Document.curPage = 0;
        }
    }

    onContextMenu = (e: React.MouseEvent): void => {
        if (!e.isPropagationStopped() && this.props.Document[Id] !== "mainDoc") { // need to test this because GoldenLayout causes a parallel hierarchy in the React DOM for its children and the main document view7
        }

        let field = Cast(this.props.Document[this.props.fieldKey], VideoField);
        if (field) {
            let url = field.url.href;
            ContextMenu.Instance.addItem({
                description: "Copy path", event: () => { Utils.CopyText(url); }, icon: "expand-arrows-alt"
            });
        }
        let width = NumCast(this.props.Document.width);
        let height = NumCast(this.props.Document.height);
        ContextMenu.Instance.addItem({
            description: "Take Snapshot", event: async () => {
                var canvas = document.createElement('canvas');
                canvas.width = 640;
                canvas.height = 640 * NumCast(this.props.Document.nativeHeight) / NumCast(this.props.Document.nativeWidth);
                var ctx = canvas.getContext('2d');//draw image to canvas. scale to target dimensions
                ctx && ctx.drawImage(this._videoBox!.player!, 0, 0, canvas.width, canvas.height);

                //convert to desired file format
                var dataUrl = canvas.toDataURL('image/png'); // can also use 'image/png'
                // if you want to preview the captured image,

                let filename = encodeURIComponent("snapshot" + this.props.Document.title + "_" + this.props.Document.curPage).replace(/\./g, "");
                SearchBox.convertDataUri(dataUrl, filename).then((returnedFilename) => {
                    if (returnedFilename) {
                        let url = DocServer.prepend(returnedFilename);
                        let imageSummary = Docs.Create.ImageDocument(url, {
                            x: NumCast(this.props.Document.x) + width, y: NumCast(this.props.Document.y),
                            width: 150, height: height / width * 150, title: "--snapshot" + NumCast(this.props.Document.curPage) + " image-"
                        });
                        this.props.addDocument && this.props.addDocument(imageSummary, false);
                        DocUtils.MakeLink(imageSummary, this.props.Document);
                    }
                });
            },
            icon: "expand-arrows-alt"
        });
    }

    setVideoBox = (videoBox: VideoBox) => { this._videoBox = videoBox; };

    private subView = (_type: CollectionViewType, renderProps: CollectionRenderProps) => {
        let props = { ...this.props, ...renderProps };
        return (<>
            <CollectionFreeFormView {...props} setVideoBox={this.setVideoBox} CollectionView={this} />
            {this.props.isSelected() ? this.uIButtons : (null)}
        </>);
    }

    render() {
        trace();
        return (
            <CollectionBaseView {...this.props} className="collectionVideoView-cont" onContextMenu={this.onContextMenu}>
                {this.subView}
            </CollectionBaseView>);
    }
}