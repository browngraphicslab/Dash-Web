import { computed, observable, runInAction, action } from "mobx";
import * as React from "react";
import MainViewModal from "../views/MainViewModal";
import { CurrentUserUtils } from "../../server/authentication/models/current_user_utils";
import { Doc } from "../../new_fields/Doc";
import { DocServer } from "../DocServer";
import { Cast } from "../../new_fields/Types";
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

@observer
export default class SharingManager extends React.Component<{}> {
    public static Instance: SharingManager;
    @observable private isOpen = false;
    @observable users: User[] = [];
    @observable target: Doc | undefined;
    @observable copied = false;

    public open = action((target: Doc) => {
        this.target = target;
        MainView.Instance.hasActiveModal = true;
        this.isOpen = true;
    });

    public close = action(() => {
        this.isOpen = false;
        setTimeout(() => {
            this.copied = false;
            MainView.Instance.hasActiveModal = false;
            this.target = undefined;
        }, 500);
    });

    constructor(props: {}) {
        super(props);
        SharingManager.Instance = this;
    }

    componentWillMount() {
        this.populateUsers();
    }

    populateUsers = async () => {
        let userList = await RequestPromise.get(Utils.prepend(RouteStore.getUsers));
        runInAction(() => {
            this.users = (JSON.parse(userList) as User[]).filter(({ email }) => email !== CurrentUserUtils.email);
        });
    }

    setInternalSharing = async (user: User, accessible: boolean) => {
        const userDocument = await DocServer.GetRefField(user.userDocumentId);
        if (!(userDocument instanceof Doc)) {
            console.log(`Couldn't get user document of user ${user.email}`);
            return;
        }
        let target = this.target;
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
            console.log(`Attempting to ${accessible ? "" : "un"}share the document ${target[Id]}`);
            if (accessible) {
                const sharedDoc = Doc.MakeAlias(target);
                if (data) {
                    data.push(sharedDoc);
                } else {
                    notifDoc.data = new List([sharedDoc]);
                }
            } else {
                let dataDocs = (await Promise.all(data.map(doc => doc))).map(doc => Doc.GetProto(doc));
                if (dataDocs.includes(target)) {
                    dataDocs.splice(dataDocs.indexOf(target), 1);
                    console.log("SUCCESSFULLY UNSHARED DOC");
                } else {
                    console.log("DIDN'T THINK WE HAD IT, SO NOT SUCCESSFULLY UNSHARED");
                }
            }
        }
    }

    private get sharingUrl() {
        if (!this.target) {
            return undefined;
        }
        let baseUrl = Utils.prepend("/doc/" + this.target[Id]);
        return `${baseUrl}?sharing=true`;
    }

    copy = action(() => {
        if (this.sharingUrl) {
            Utils.CopyText(this.sharingUrl);
            this.copied = true;
        }
    });

    private get sharingInterface() {
        return (
            <div className={"sharing-interface"}>
                <div className={"link-container"}>
                    <div className={"link-box"}>{this.sharingUrl}</div>
                    <div
                        className={"copy"}
                        style={{ backgroundColor: this.copied ? "lawngreen" : "gainsboro" }}
                        onClick={this.copy}
                    >
                        <FontAwesomeIcon icon={fa.faCopy} />
                    </div>
                </div>
                <div className={"users-list"} style={{ marginTop: this.users.length ? 0 : 20 }}>
                    {!this.users.length ? "There are no other users in your database." :
                        this.users.map(user => (
                            <div
                                key={user.email}
                                className={"container"}
                            >
                                <select
                                    className={"permissions-dropdown"}
                                    onChange={e => this.setInternalSharing(user, e.currentTarget.value !== SharingPermissions.None)}
                                >
                                    {Object.values(SharingPermissions).map(permission => {
                                        return (
                                            <option key={permission} value={permission}>
                                                {permission}
                                            </option>
                                        );
                                    })}
                                </select>
                                <span className={"padding"}>{user.email}</span>
                            </div>
                        ))
                    }
                </div>
            </div>
        );
    }

    render() {
        return (
            <MainViewModal
                contents={this.sharingInterface}
                isDisplayed={this.isOpen}
                interactive={true}
            />
        );
    }

}