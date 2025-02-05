import {FloatElement} from '../custom';
import {CustomElement, InjectAfter, InjectionMode} from '../injectors';
import {html, css, TemplateResult, HTMLTemplateResult} from 'lit';
import {state} from 'lit/decorators.js';
import {InventoryAsset} from '../../types/steam';
import {gFloatFetcher} from '../../services/float_fetcher';
import {ItemInfo} from '../../bridge/handlers/fetch_inspect_info';
import {formatSeed, isSkin, renderClickableRank} from '../../utils/skin';
import {Observe} from '../../utils/observers';
import {FetchStallResponse} from '../../bridge/handlers/fetch_stall';
import {gStallFetcher} from '../../services/stall_fetcher';
import {Contract} from '../../types/float_market';

/**
 * Why do we bind to iteminfo0 AND iteminfo1?
 *
 * Steam uses two divs that are interchanged (presumably to make a "fade" animation between them) for each selected
 * item click.
 */
@CustomElement()
@InjectAfter('div#iteminfo0_content .item_desc_description div.item_desc_game_info', InjectionMode.CONTINUOUS)
@InjectAfter('div#iteminfo1_content .item_desc_description div.item_desc_game_info', InjectionMode.CONTINUOUS)
export class SelectedItemInfo extends FloatElement {
    static styles = [
        ...FloatElement.styles,
        css`
            .container {
                margin-bottom: 10px;
            }

            .market-btn-container {
                margin: 10px 0 10px 0;
                padding: 5px;
                width: fit-content;
                border: 1px #5a5a5a solid;
                background-color: #383838;
                border-radius: 3px;
            }

            .market-btn {
                font-size: 15px;
                display: flex;
                align-items: center;
                color: #ebebeb;
                text-decoration: none;
            }
        `,
    ];

    @state()
    private itemInfo: ItemInfo | undefined;

    @state()
    private loading: boolean = false;

    private stall: FetchStallResponse | undefined;

    get asset(): InventoryAsset | undefined {
        return g_ActiveInventory?.selectedItem;
    }

    get inspectLink(): string | undefined {
        if (!this.asset) return;

        if (!this.asset.description?.actions || this.asset.description?.actions?.length === 0) return;

        if (!g_ActiveInventory?.m_owner) {
            return;
        }

        return this.asset.description
            ?.actions![0].link.replace('%owner_steamid%', g_ActiveInventory.m_owner.strSteamId!)
            .replace('%assetid%', this.asset.assetid!);
    }

    get stallListing(): Contract | undefined {
        if (!this.stall) {
            return;
        }

        return (this.stall.listings || []).find((e) => e.item.asset_id === this.asset?.assetid);
    }

    protected render(): HTMLTemplateResult {
        if (this.loading) {
            return html`<div>Loading...</div>`;
        }

        if (!this.itemInfo) {
            return html``;
        }

        return html`
            <div class="container">
                <div>Float: ${this.itemInfo.floatvalue.toFixed(14)} ${renderClickableRank(this.itemInfo)}</div>
                <div>Paint Seed: ${formatSeed(this.itemInfo)}</div>
                ${this.renderListOnCSGOFloat()} ${this.renderFloatMarketListing()}
            </div>
        `;
    }

    renderFloatMarketListing(): TemplateResult<1> {
        if (!this.stallListing) {
            return html``;
        }

        return html`
            <div class="market-btn-container">
                <a class="market-btn" href="https://csgofloat.com/item/${this.stallListing.id}" target="_blank">
                    <img src="https://csgofloat.com/assets/full_logo.png" height="21" style="margin-right: 5px;" />
                    <span>
                        Listed for
                        <b>$${(this.stallListing.price / 100).toFixed(2)}</b>
                    </span>
                </a>
            </div>
        `;
    }

    renderListOnCSGOFloat(): TemplateResult<1> {
        if (this.stallListing) {
            // Don't tell them to list it if it's already listed...
            return html``;
        }

        if (g_ActiveInventory?.m_owner?.strSteamId !== g_steamID) {
            // Not the signed-in user, don't show
            return html``;
        }

        return html`
            <div class="market-btn-container">
                <a class="market-btn" href="https://csgofloat.com" target="_blank">
                    <span>List on </span>
                    <img src="https://csgofloat.com/assets/full_logo.png" height="21" style="margin-left: 5px;" />
                </a>
            </div>
        `;
    }

    async processSelectChange() {
        // Reset state in-case they swap between skin and non-skin
        this.itemInfo = undefined;

        if (!this.asset) return;

        if (!isSkin(this.asset.description)) return;

        // Commodities won't have inspect links
        if (!this.inspectLink) return;

        try {
            this.loading = true;
            this.itemInfo = await gFloatFetcher.fetch({
                link: this.inspectLink,
            });
        } catch (e: any) {
            console.error(`Failed to fetch float for ${this.asset.assetid}: ${e.toString()}`);
        } finally {
            this.loading = false;
        }
    }

    connectedCallback() {
        super.connectedCallback();

        // For the initial load, in case an item is pre-selected
        this.processSelectChange();

        Observe(
            () => this.asset,
            () => {
                this.processSelectChange();
            }
        );

        if (g_ActiveInventory?.m_owner?.strSteamId) {
            // Ignore errors
            gStallFetcher
                .fetch({steam_id64: g_ActiveInventory?.m_owner.strSteamId})
                .then((stall) => (this.stall = stall));
        }
    }
}
