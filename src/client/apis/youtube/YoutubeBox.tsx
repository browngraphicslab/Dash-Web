import "../../views/nodes/WebBox.scss";
import React = require("react");
import { FieldViewProps, FieldView } from "../../views/nodes/FieldView";
import { HtmlField } from "../../../new_fields/HtmlField";
import { WebField } from "../../../new_fields/URLField";
import { observer } from "mobx-react";
import { computed, reaction, IReactionDisposer, observable, action } from 'mobx';
import { DocumentDecorations } from "../../views/DocumentDecorations";
import { InkingControl } from "../../views/InkingControl";
import { Utils } from "../../../Utils";
import { DocServer } from "../../DocServer";
import { NumCast } from "../../../new_fields/Types";
import "./YoutubeBox.scss";
import { Docs } from "../../documents/Documents";


@observer
export class YoutubeBox extends React.Component<FieldViewProps> {

    @observable YoutubeSearchElement: HTMLInputElement | undefined;
    @observable searchResultsFound: boolean = false;
    @observable searchResults: any[] = [];
    @observable videoClicked: boolean = false;
    @observable selectedVideoUrl: string = "";

    public static LayoutString() { return FieldView.LayoutString(YoutubeBox); }

    componentWillMount() {
        //DocServer.getYoutubeChannels();
    }

    _ignore = 0;
    onPreWheel = (e: React.WheelEvent) => {
        this._ignore = e.timeStamp;
    }
    onPrePointer = (e: React.PointerEvent) => {
        this._ignore = e.timeStamp;
    }
    onPostPointer = (e: React.PointerEvent) => {
        if (this._ignore !== e.timeStamp) {
            e.stopPropagation();
        }
    }
    onPostWheel = (e: React.WheelEvent) => {
        if (this._ignore !== e.timeStamp) {
            e.stopPropagation();
        }
    }

    onEnterKeyDown = (e: React.KeyboardEvent) => {
        if (e.keyCode === 13) {
            let submittedTitle = this.YoutubeSearchElement!.value;
            this.YoutubeSearchElement!.value = "";
            this.YoutubeSearchElement!.blur();
            DocServer.getYoutubeVideos(submittedTitle, this.processesVideoResults);

        }
    }

    @action
    processesVideoResults = (videos: any[]) => {
        this.searchResults = videos;
        console.log("Results: ", this.searchResults);
        if (this.searchResults.length > 0) {
            this.searchResultsFound = true;
            if (this.videoClicked) {
                this.videoClicked = false;
            }
        }
    }

    filterYoutubeTitleResult = (resultTitle: string) => {
        let processedTitle: string = resultTitle.ReplaceAll("&amp;", "&");
        processedTitle = processedTitle.ReplaceAll("&#39;", "'");
        processedTitle = processedTitle.ReplaceAll("&quot;", "\"");
        return processedTitle;
    }

    renderSearchResultsOrVideo = () => {
        if (this.searchResultsFound) {
            return <ul>
                {this.searchResults.map((video) => {
                    let filteredTitle = this.filterYoutubeTitleResult(video.snippet.title);
                    return <li onClick={() => this.embedVideoOnClick(video.id.videoId, filteredTitle)} key={video.id.videoId}><img src={video.snippet.thumbnails.medium.url} />  {filteredTitle}</li>;
                })}
            </ul>;
            // } else if (this.videoClicked) {
            //     return <iframe src={this.selectedVideoUrl} height={NumCast(this.props.Document.height) - 40} width={NumCast(this.props.Document.width)}></iframe>;
            // } 
        } else {
            return (null);
        }
    }

    @action
    embedVideoOnClick = (videoId: string, filteredTitle: string) => {
        let embeddedUrl = "https://www.youtube.com/embed/" + videoId;
        this.selectedVideoUrl = embeddedUrl;
        let addFunction = this.props.addDocument!;
        let newVideoX = NumCast(this.props.Document.x) + NumCast(this.props.Document.width);
        let newVideoY = NumCast(this.props.Document.y) + NumCast(this.props.Document.height);

        addFunction(Docs.Create.VideoDocument(embeddedUrl, { title: filteredTitle, width: 400, height: 315, x: newVideoX, y: newVideoY }));

        //this.props.addDocument(Docs.Create.VideoDocument(embeddedUrl, { title: embeddedUrl, width: 400, height: 315 }));
        //this.searchResultsFound = false;
        this.videoClicked = true;
    }

    render() {
        let field = this.props.Document[this.props.fieldKey];
        let content =
            <div style={{ width: "100%", height: "100%", position: "absolute" }} onWheel={this.onPostWheel} onPointerDown={this.onPostPointer} onPointerMove={this.onPostPointer} onPointerUp={this.onPostPointer}>
                <input type="text" placeholder="Search for a video" onKeyDown={this.onEnterKeyDown} style={{ height: 40, width: "100%", border: "1px solid black", padding: 5, textAlign: "center" }} ref={(e) => this.YoutubeSearchElement = e!} />
                {this.renderSearchResultsOrVideo()}
            </div>;

        let frozen = !this.props.isSelected() || DocumentDecorations.Instance.Interacting;

        let classname = "webBox-cont" + (this.props.isSelected() && !InkingControl.Instance.selectedTool && !DocumentDecorations.Instance.Interacting ? "-interactive" : "");
        return (
            <>
                <div className={classname}  >
                    {content}
                </div>
                {!frozen ? (null) : <div className="webBox-overlay" onWheel={this.onPreWheel} onPointerDown={this.onPrePointer} onPointerMove={this.onPrePointer} onPointerUp={this.onPrePointer} />}
            </>);
    }
}