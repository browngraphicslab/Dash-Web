import { observable, runInAction, action, autorun } from "mobx";
import * as React from "react";
import MainViewModal from "../views/MainViewModal";
import { CurrentUserUtils } from "../../server/authentication/models/current_user_utils";
import { Doc, Opt } from "../../new_fields/Doc";
import { DocServer } from "../DocServer";
import { Cast, StrCast } from "../../new_fields/Types";
import { listSpec } from "../../new_fields/Schema";
import { List } from "../../new_fields/List";
import { RouteStore } from "../../server/RouteStore";
import * as RequestPromise from "request-promise";
import { Utils } from "../../Utils";
import "./SharingManager.scss";
import { Id } from "../../new_fields/FieldSymbols";
import { observer } from "mobx-react";
import { MainView } from "../views/MainView";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { library } from '@fortawesome/fontawesome-svg-core';
import * as fa from '@fortawesome/free-solid-svg-icons';
import { DocumentView } from "../views/nodes/DocumentView";
import { SelectionManager } from "./SelectionManager";
import { DocumentManager } from "./DocumentManager";
import { CollectionVideoView } from "../views/collections/CollectionVideoView";
import { CollectionPDFView } from "../views/collections/CollectionPDFView";
import { CollectionView } from "../views/collections/CollectionView";

library.add(fa.faCopy);

export interface User {
    email: string;
    userDocumentId: string;
}

export enum SharingPermissions {
    None = "Not Shared",
    View = "Can View",
    Comment = "Can Comment",
    Edit = "Can Edit"
}

const ColorMapping = new Map<string, string>([
    [SharingPermissions.None, "red"],
    [SharingPermissions.View, "maroon"],
    [SharingPermissions.Comment, "blue"],
    [SharingPermissions.Edit, "green"]
]);

const SharingKey = "sharingPermissions";
const PublicKey = "publicLinkPermissions";
const DefaultColor = "black";

@observer
export default class SharingManager extends React.Component<{}> {
    public static Instance: SharingManager;
    @observable private isOpen = false;
    @observable private users: User[] = [];
    @observable private targetDoc: Doc | undefined;
    @observable private targetDocView: DocumentView | undefined;
    @observable private copied = false;
    @observable private dialogueBoxOpacity = 1;
    @observable private overlayOpacity = 0.4;

    private get linkVisible() {
        return this.sharingDoc ? this.sharingDoc[PublicKey] !== SharingPermissions.None : false;
    }

    public open = (target: DocumentView) => {
        SelectionManager.DeselectAll();
        this.populateUsers().then(action(() => {
            this.targetDocView = target;
            this.targetDoc = target.props.Document;
            MainView.Instance.hasActiveModal = true;
            this.isOpen = true;
            if (!this.sharingDoc) {
                this.sharingDoc = new Doc;
            }
        }));
    }

    public close = action(() => {
        this.isOpen = false;
        setTimeout(action(() => {
            this.copied = false;
            MainView.Instance.hasActiveModal = false;
            this.targetDoc = undefined;
        }), 500);
    });

    private get sharingDoc() {
        return this.targetDoc ? Cast(this.targetDoc[SharingKey], Doc) as Doc : undefined;
    }

    private set sharingDoc(value: Doc | undefined) {
        this.targetDoc && (this.targetDoc[SharingKey] = value);
    }

    constructor(props: {}) {
        super(props);
        SharingManager.Instance = this;
    }

    populateUsers = async () => {
        let userList = await RequestPromise.get(Utils.prepend(RouteStore.getUsers));
        runInAction(() => {
            this.users = (JSON.parse(userList) as User[]).filter(({ email }) => email !== Doc.CurrentUserEmail);
        });
    }

    setInternalSharing = async (user: User, state: string) => {
        if (!this.sharingDoc) {
            console.log("SHARING ABORTED!");
            return;
        }
        let sharingDoc = await this.sharingDoc;
        sharingDoc[user.userDocumentId] = state;
        const userDocument = await DocServer.GetRefField(user.userDocumentId);
        if (!(userDocument instanceof Doc)) {
            console.log(`Couldn't get user document of user ${user.email}`);
            return;
        }
        let target = this.targetDoc;
        if (!target) {
            console.log("SharingManager trying to share an undefined document!!");
            return;
        }
        const notifDoc = await Cast(userDocument.optionalRightCollection, Doc);
        if (notifDoc instanceof Doc) {
            const data = await Cast(notifDoc.data, listSpec(Doc));
            if (!data) {
                console.log("UNABLE TO ACCESS NOTIFICATION DATA");
                return;
            }
            console.log(`Attempting to set permissions to ${state} for the document ${target[Id]}`);
            if (state !== SharingPermissions.None) {
                const sharedDoc = Doc.MakeAlias(target);
                if (data) {
                    data.push(sharedDoc);
                } else {
                    notifDoc.data = new List([sharedDoc]);
                }
            } else {
                let dataDocs = (await Promise.all(data.map(doc => doc))).map(doc => Doc.GetProto(doc));
                if (dataDocs.includes(target)) {
                    console.log("Searching in ", dataDocs, "for", target);
                    dataDocs.splice(dataDocs.indexOf(target), 1);
                    console.log("SUCCESSFULLY UNSHARED DOC");
                } else {
                    console.log("DIDN'T THINK WE HAD IT, SO NOT SUCCESSFULLY UNSHARED");
                }
            }
        }
    }

    private setExternalSharing = (state: string) => {
        let sharingDoc = this.sharingDoc;
        if (!sharingDoc) {
            return;
        }
        sharingDoc[PublicKey] = state;
    }

    private get sharingUrl() {
        if (!this.targetDoc) {
            return undefined;
        }
        let baseUrl = Utils.prepend("/doc/" + this.targetDoc[Id]);
        return `${baseUrl}?sharing=true`;
    }

    copy = action(() => {
        if (this.sharingUrl) {
            Utils.CopyText(this.sharingUrl);
            this.copied = true;
        }
    });

    private get sharingOptions() {
        return Object.values(SharingPermissions).map(permission => {
            return (
                <option key={permission} value={permission}>
                    {permission}
                </option>
            );
        });
    }

    private focusOn = (contents: string) => {
        let title = this.targetDoc ? StrCast(this.targetDoc.title) : "";
        return (
            <span
                title={title}
                onClick={() => {
                    let context: Opt<CollectionVideoView | CollectionPDFView | CollectionView>;
                    if (this.targetDoc && this.targetDocView && (context = this.targetDocView.props.ContainingCollectionView)) {
                        DocumentManager.Instance.jumpToDocument(this.targetDoc, true, undefined, context.props.Document);
                    }
                }}
                onPointerEnter={action(() => {
                    if (this.targetDoc) {
                        Doc.BrushDoc(this.targetDoc);
                        this.dialogueBoxOpacity = 0.1;
                        this.overlayOpacity = 0.1;
                    }
                })}
                onPointerLeave={action(() => {
                    this.targetDoc && Doc.UnBrushDoc(this.targetDoc);
                    this.dialogueBoxOpacity = 1;
                    this.overlayOpacity = 0.4;
                })}
            >
                {contents}
            </span>
        );
    }

    private get sharingInterface() {
        return (
            <div className={"sharing-interface"}>
                <p className={"share-link"}>Manage the public link to {this.focusOn("this document...")}</p>
                {!this.linkVisible ? (null) :
                    <div className={"link-container"}>
                        <div className={"link-box"} onClick={this.copy}>{this.sharingUrl}</div>
                        <div
                            title={"Copy link to clipboard"}
                            className={"copy"}
                            style={{ backgroundColor: this.copied ? "lawngreen" : "gainsboro" }}
                            onClick={this.copy}
                        >
                            <FontAwesomeIcon icon={fa.faCopy} />
                        </div>
                    </div>
                }
                <div className={"people-with-container"}>
                    {!this.linkVisible ? (null) : <p className={"people-with"}>People with this link</p>}
                    <select
                        className={"people-with-select"}
                        value={this.sharingDoc ? StrCast(this.sharingDoc[PublicKey], SharingPermissions.None) : SharingPermissions.None}
                        style={{
                            marginLeft: this.linkVisible ? 10 : 0,
                            color: this.sharingDoc ? ColorMapping.get(StrCast(this.sharingDoc[PublicKey], SharingPermissions.None)) : DefaultColor,
                            borderColor: this.sharingDoc ? ColorMapping.get(StrCast(this.sharingDoc[PublicKey], SharingPermissions.None)) : DefaultColor
                        }}
                        onChange={e => this.setExternalSharing(e.currentTarget.value)}
                    >
                        {this.sharingOptions}
                    </select>
                </div>
                <div className={"hr-substitute"} />
                <p className={"share-individual"}>Privately share {this.focusOn("this document")} with an individual...</p>
                <div className={"users-list"} style={{ display: this.users.length ? "block" : "flex" }}>
                    {!this.users.length ? "There are no other users in your database." :
                        this.users.map(user => {
                            return (
                                <div
                                    key={user.email}
                                    className={"container"}
                                >
                                    <select
                                        className={"permissions-dropdown"}
                                        value={this.sharingDoc ? StrCast(this.sharingDoc[user.userDocumentId], SharingPermissions.None) : SharingPermissions.None}
                                        style={{
                                            color: this.sharingDoc ? ColorMapping.get(StrCast(this.sharingDoc[user.userDocumentId], SharingPermissions.None)) : DefaultColor,
                                            borderColor: this.sharingDoc ? ColorMapping.get(StrCast(this.sharingDoc[user.userDocumentId], SharingPermissions.None)) : DefaultColor
                                        }}
                                        onChange={e => this.setInternalSharing(user, e.currentTarget.value)}
                                    >
                                        {this.sharingOptions}

                                    </select>
                                    <span className={"padding"}>{user.email}</span>
                                </div>
                            );
                        })
                    }
                </div>
                <div className={"close-button"} onClick={this.close}>Done</div>
            </div>
        );
    }

    render() {
        return (
            <MainViewModal
                contents={this.sharingInterface}
                isDisplayed={this.isOpen}
                interactive={true}
                dialogueBoxDisplayedOpacity={this.dialogueBoxOpacity}
                overlayDisplayedOpacity={this.overlayOpacity}
            />
        );
    }

}