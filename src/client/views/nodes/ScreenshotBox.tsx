import React = require("react");
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { action, computed, IReactionDisposer, observable, runInAction } from "mobx";
import { observer } from "mobx-react";
import * as rp from 'request-promise';
import { Doc, WidthSym } from "../../../fields/Doc";
import { documentSchema } from "../../../fields/documentSchemas";
import { InkTool } from "../../../fields/InkField";
import { listSpec, makeInterface } from "../../../fields/Schema";
import { Cast, NumCast } from "../../../fields/Types";
import { VideoField } from "../../../fields/URLField";
import { emptyFunction, returnFalse, returnOne, returnZero, Utils, OmitKeys } from "../../../Utils";
import { Docs } from "../../documents/Documents";
import { CollectionFreeFormView } from "../collections/collectionFreeForm/CollectionFreeFormView";
import { ContextMenu } from "../ContextMenu";
import { ContextMenuProps } from "../ContextMenuItem";
import { ViewBoxBaseComponent } from "../DocComponent";
import { FieldView, FieldViewProps } from './FieldView';
import "./ScreenshotBox.scss";
const path = require('path');

type ScreenshotDocument = makeInterface<[typeof documentSchema]>;
const ScreenshotDocument = makeInterface(documentSchema);

@observer
export class ScreenshotBox extends ViewBoxBaseComponent<FieldViewProps, ScreenshotDocument>(ScreenshotDocument) {
    private _reactionDisposer?: IReactionDisposer;
    private _videoRef: HTMLVideoElement | null = null;
    public static LayoutString(fieldKey: string) { return FieldView.LayoutString(ScreenshotBox, fieldKey); }

    public get player(): HTMLVideoElement | null {
        return this._videoRef;
    }

    videoLoad = () => {
        const aspect = this.player!.videoWidth / this.player!.videoHeight;
        const nativeWidth = Doc.NativeWidth(this.layoutDoc);
        const nativeHeight = Doc.NativeHeight(this.layoutDoc);
        if (!nativeWidth || !nativeHeight) {
            if (!nativeWidth) Doc.SetNativeWidth(this.dataDoc, 1200);
            Doc.SetNativeHeight(this.dataDoc, (nativeWidth || 1200) / aspect);
            this.layoutDoc._height = (this.layoutDoc[WidthSym]() || 0) / aspect;
        }
    }

    @action public Snapshot() {
        const width = NumCast(this.layoutDoc._width);
        const height = NumCast(this.layoutDoc._height);
        const canvas = document.createElement('canvas');
        canvas.width = 640;
        canvas.height = 640 / (Doc.NativeAspect(this.layoutDoc) || 1);
        const ctx = canvas.getContext('2d');//draw image to canvas. scale to target dimensions
        if (ctx) {
            ctx.rect(0, 0, canvas.width, canvas.height);
            ctx.fillStyle = "blue";
            ctx.fill();
            this._videoRef && ctx.drawImage(this._videoRef, 0, 0, canvas.width, canvas.height);
        }

        if (this._videoRef) {
            //convert to desired file format
            const dataUrl = canvas.toDataURL('image/png'); // can also use 'image/png'
            // if you want to preview the captured image,
            const filename = path.basename(encodeURIComponent("screenshot" + Utils.GenerateGuid().replace(/\..*$/, "").replace(" ", "_")));
            ScreenshotBox.convertDataUri(dataUrl, filename).then(returnedFilename => {
                setTimeout(() => {
                    if (returnedFilename) {
                        const imageSummary = Docs.Create.ImageDocument(Utils.prepend(returnedFilename), {
                            x: NumCast(this.layoutDoc.x) + width, y: NumCast(this.layoutDoc.y),
                            _width: 150, _height: height / width * 150, title: "--screenshot--"
                        });
                        if (!this.props.addDocument || this.props.addDocument === returnFalse) {
                            const spt = this.props.ScreenToLocalTransform().inverse().transformPoint(0, 0);
                            imageSummary.x = spt[0];
                            imageSummary.y = spt[1];
                            Cast(Cast(Doc.UserDoc().myOverlayDocs, Doc, null)?.data, listSpec(Doc), []).push(imageSummary);
                        } else {
                            this.props.addDocument?.(imageSummary);
                        }
                    }
                }, 500);
            });
        }
    }

    componentDidMount() {
    }

    componentWillUnmount() {
        this._reactionDisposer && this._reactionDisposer();
    }

    @action
    setVideoRef = (vref: HTMLVideoElement | null) => {
        this._videoRef = vref;
    }

    public static async convertDataUri(imageUri: string, returnedFilename: string) {
        try {
            const posting = Utils.prepend("/uploadURI");
            const returnedUri = await rp.post(posting, {
                body: {
                    uri: imageUri,
                    name: returnedFilename
                },
                json: true,
            });
            return returnedUri;

        } catch (e) {
            console.log("ScreenShotBox:" + e);
        }
    }
    @observable _screenCapture = false;
    specificContextMenu = (e: React.MouseEvent): void => {
        const field = Cast(this.dataDoc[this.fieldKey], VideoField);
        if (field) {
            const url = field.url.href;
            const subitems: ContextMenuProps[] = [];
            subitems.push({ description: "Take Snapshot", event: () => this.Snapshot(), icon: "expand-arrows-alt" });
            subitems.push({
                description: "Screen Capture", event: (async () => {
                    runInAction(() => this._screenCapture = !this._screenCapture);
                    this._videoRef!.srcObject = !this._screenCapture ? undefined : await (navigator.mediaDevices as any).getDisplayMedia({ video: true });
                }), icon: "expand-arrows-alt"
            });
            ContextMenu.Instance.addItem({ description: "Options...", subitems: subitems, icon: "video" });
        }
    }

    @computed get content() {
        const interactive = Doc.GetSelectedTool() !== InkTool.None || !this.props.isSelected() ? "" : "-interactive";
        const style = "videoBox-content" + interactive;
        return <video className={`${style}`} key="video" autoPlay={this._screenCapture} ref={this.setVideoRef}
            style={{ width: this._screenCapture ? "100%" : undefined, height: this._screenCapture ? "100%" : undefined }}
            onCanPlay={this.videoLoad}
            controls={true}
            onClick={e => e.preventDefault()}>
            <source type="video/mp4" />
            Not supported.
            </video>;
    }

    toggleRecording = action(async () => {
        this._screenCapture = !this._screenCapture;
        this._videoRef!.srcObject = !this._screenCapture ? undefined : await (navigator.mediaDevices as any).getDisplayMedia({ video: true });
    });

    private get uIButtons() {
        return (<div className="screenshotBox-uiButtons">
            <div className="screenshotBox-recorder" key="snap" onPointerDown={this.toggleRecording} >
                <FontAwesomeIcon icon="file" size="lg" />
            </div>,
            <div className="screenshotBox-snapshot" key="snap" onPointerDown={this.onSnapshot} >
                <FontAwesomeIcon icon="camera" size="lg" />
            </div>
        </div>);
    }

    onSnapshot = (e: React.PointerEvent) => {
        this.Snapshot();
        e.stopPropagation();
        e.preventDefault();
    }


    contentFunc = () => [this.content];
    render() {
        return (<div className="videoBox" onContextMenu={this.specificContextMenu}
            style={{ width: `${100}%`, height: `${100}%` }} >
            <div className="videoBox-viewer" >
                <CollectionFreeFormView {...OmitKeys(this.props, ["NativeWidth", "NativeHeight"]).omit}
                    PanelHeight={this.props.PanelHeight}
                    PanelWidth={this.props.PanelWidth}
                    focus={this.props.focus}
                    isSelected={this.props.isSelected}
                    isAnnotationOverlay={true}
                    select={emptyFunction}
                    active={returnFalse}
                    scaling={returnOne}
                    whenActiveChanged={emptyFunction}
                    removeDocument={returnFalse}
                    moveDocument={returnFalse}
                    addDocument={returnFalse}
                    CollectionView={undefined}
                    ScreenToLocalTransform={this.props.ScreenToLocalTransform}
                    renderDepth={this.props.renderDepth + 1}
                    ContainingCollectionDoc={this.props.ContainingCollectionDoc}>
                    {this.contentFunc}
                </CollectionFreeFormView>
            </div>
            {this.props.isSelected() ? this.uIButtons : (null)}
        </div >);
    }
}