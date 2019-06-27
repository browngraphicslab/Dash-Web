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


@observer
export class YoutubeBox extends React.Component<FieldViewProps> {

    @observable YoutubeSearchElement: HTMLInputElement | undefined;
    @observable searchResultsFound: boolean = false;
    @observable searchResults: any[] = [];

    public static LayoutString() { return FieldView.LayoutString(YoutubeBox); }

    componentWillMount() {
        DocServer.getYoutubeChannels();
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
            console.log(submittedTitle);
            this.YoutubeSearchElement!.value = "";
            this.YoutubeSearchElement!.blur();
            DocServer.getYoutubeVideos(submittedTitle, this.processesVideoResults);

        }
    }

    @action
    processesVideoResults = (videos: any[]) => {
        this.searchResults = videos;
        console.log("Callback got called");
        if (this.searchResults.length > 0) {
            this.searchResultsFound = true;
        }
    }

    renderSearchResults = () => {
        if (this.searchResultsFound) {
            return <ul>
                {this.searchResults.map((video) => {
                    return <li key={video.id.videoId}>{video.snippet.title}</li>;
                })}
            </ul>;
        } else {
            return (null);
        }
    }

    render() {
        let field = this.props.Document[this.props.fieldKey];
        let content =
            <div style={{ width: "100%", height: "100%", position: "absolute" }} onWheel={this.onPostWheel} onPointerDown={this.onPostPointer} onPointerMove={this.onPostPointer} onPointerUp={this.onPostPointer}>
                <input type="text" placeholder="Search for a video" onKeyDown={this.onEnterKeyDown} style={{ width: "100%", border: "1px solid black", padding: 5, textAlign: "center" }} ref={(e) => this.YoutubeSearchElement = e!} />
                {this.renderSearchResults()}
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