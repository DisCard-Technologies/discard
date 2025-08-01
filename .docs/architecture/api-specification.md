# API Specification

### REST API Specification

```yaml
openapi: 3.0.0
info:
  title: DisCard Privacy-First Virtual Card API
  version: 1.0.0
  description: REST API for disposable virtual crypto card management with privacy-preserving architecture
servers:
  - url: https://api.discard.app/v1
    description: Production API Server
  - url: https://staging-api.discard.app/v1  
    description: Staging API Server

components:
  securitySchemes:
    BearerAuth:
      type: http
      scheme: bearer
      bearerFormat: JWT
    
  schemas:
    Card:
      type: object
      properties:
        cardId:
          type: string
          format: uuid
        status:
          type: string
          enum: [active, paused, expired, deleted]
        currentBalance:
          type: number
          description: Balance in cents
        spendingLimit:
          type: number
          description: Spending limit in cents
        expirationDate:
          type: string
          pattern: '^(0[1-9]|1[0-2])\/[0-9]{2}$'
        createdAt:
          type: string
          format: date-time
    
    CreateCardRequest:
      type: object
      required:
        - spendingLimit
      properties:
        spendingLimit:
          type: number
          minimum: 100
          maximum: 500000
        expirationDate:
          type: string
          pattern: '^(0[1-9]|1[0-2])\/[0-9]{2}$'
        merchantRestrictions:
          type: array
          items:
            type: string
    
    CryptoFundingRequest:
      type: object
      required:
        - cryptoType
        - cryptoAmount
        - cardId
      properties:
        cryptoType:
          type: string
          enum: [BTC, ETH, USDT, USDC, XRP]
        cryptoAmount:
          type: string
          pattern: '^[0-9]+\.[0-9]+$'
        cardId:
          type: string
          format: uuid
        slippageProtection:
          type: number
          minimum: 0.001
          maximum: 0.05

paths:
  /auth/login:
    post:
      summary: User authentication with minimal data collection
      requestBody:
        required: true
        content:
          application/json:
            schema:
              type: object
              required:
                - email
                - password
              properties:
                email:
                  type: string
                  format: email
                password:
                  type: string
                  minLength: 8
      responses:
        '200':
          description: Authentication successful
          content:
            application/json:
              schema:
                type: object
                properties:
                  accessToken:
                    type: string
                  refreshToken:
                    type: string
                  expiresIn:
                    type: number
        '401':
          description: Authentication failed
        '429':
          description: Rate limit exceeded

  /cards:
    post:
      summary: Create new disposable virtual card
      security:
        - BearerAuth: []
      requestBody:
        required: true
        content:
          application/json:
            schema:
              $ref: '#/components/schemas/CreateCardRequest'
      responses:
        '201':
          description: Card created successfully
          content:
            application/json:
              schema:
                allOf:
                  - $ref: '#/components/schemas/Card'
                  - type: object
                    properties:
                      cardNumber:
                        type: string
                        description: Encrypted card number (temporary exposure)
                      cvv:
                        type: string
                        description: Card CVV (temporary exposure)
        '400':
          description: Invalid request parameters
        '403':
          description: Card creation limit exceeded
        '500':
          description: Card provisioning failed

    get:
      summary: List user's active cards (no cross-card correlation)
      security:
        - BearerAuth: []
      parameters:
        - name: status
          in: query
          schema:
            type: string
            enum: [active, paused, expired]
        - name: limit
          in: query
          schema:
            type: integer
            minimum: 1
            maximum: 50
            default: 20
      responses:
        '200':
          description: Cards retrieved successfully
          content:
            application/json:
              schema:
                type: object
                properties:
                  cards:
                    type: array
                    items:
                      $ref: '#/components/schemas/Card'
                  total:
                    type: number

  /cards/{cardId}:
    get:
      summary: Get card details and transaction history
      security:
        - BearerAuth: []
      parameters:
        - name: cardId
          in: path
          required: true
          schema:
            type: string
            format: uuid
      responses:
        '200':
          description: Card details retrieved
          content:
            application/json:
              schema:
                allOf:
                  - $ref: '#/components/schemas/Card'
                  - type: object
                    properties:
                      transactions:
                        type: array
                        items:
                          type: object
                          properties:
                            transactionId:
                              type: string
                            merchantName:
                              type: string
                            amount:
                              type: number
                            status:
                              type: string
                            processedAt:
                              type: string
                              format: date-time
        '404':
          description: Card not found
        '403':
          description: Access denied

    delete:
      summary: Permanently delete disposable card with cryptographic verification
      security:
        - BearerAuth: []
      parameters:
        - name: cardId
          in: path
          required: true
          schema:
            type: string
            format: uuid
      responses:
        '200':
          description: Card deleted successfully
          content:
            application/json:
              schema:
                type: object
                properties:
                  deleted:
                    type: boolean
                  deletionProof:
                    type: string
                    description: Cryptographic proof of deletion
                  deletedAt:
                    type: string
                    format: date-time
        '404':
          description: Card not found
        '409':
          description: Card has pending transactions

  /crypto/rates:
    get:
      summary: Get real-time cryptocurrency conversion rates
      security:
        - BearerAuth: []
      parameters:
        - name: symbols
          in: query
          schema:
            type: string
            example: "BTC,ETH,USDT,USDC,XRP"
      responses:
        '200':
          description: Current rates retrieved
          content:
            application/json:
              schema:
                type: object
                properties:
                  rates:
                    type: object
                    additionalProperties:
                      type: object
                      properties:
                        usd:
                          type: number
                        change24h:
                          type: number
                        lastUpdated:
                          type: string
                          format: date-time
                  networkFees:
                    type: object
                    additionalProperties:
                      type: object
                      properties:
                        fast:
                          type: number
                        standard:
                          type: number
                        slow:
                          type: number

  /crypto/fund:
    post:
      summary: Fund card with cryptocurrency
      security:
        - BearerAuth: []
      requestBody:
        required: true
        content:
          application/json:
            schema:
              $ref: '#/components/schemas/CryptoFundingRequest'
      responses:
        '202':
          description: Funding transaction initiated
          content:
            application/json:
              schema:
                type: object
                properties:
                  transactionId:
                    type: string
                    format: uuid
                  status:
                    type: string
                    enum: [pending]
                  expectedConfirmation:
                    type: string
                    format: date-time
                  depositAddress:
                    type: string
                  requiredConfirmations:
                    type: number
        '400':
          description: Invalid funding request
        '409':
          description: Rate changed, re-confirmation required

security:
  - BearerAuth: []
```
